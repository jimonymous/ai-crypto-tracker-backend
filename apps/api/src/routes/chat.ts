import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { verifyJwt } from "../auth/jwt";
import { ensureActiveAccess } from "../billing/accessPass";
import { selectChainWithRpc } from "../chain/config";
import { callInference, hasLocalArtifacts, callChat } from "../ai/client";
import { getPremiumStatus } from "../chain/gating";
import { config } from "../config";
import {
  createConversation,
  getConversation,
  listConversations,
  listMessages,
  addMessage,
  ConversationMessage
} from "../chat/conversationStore";

export default async function chatRoutes(app: FastifyInstance) {
  app.post(
    "/ai/chat",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            chainId: { type: "string", pattern: "^[0-9]+$" },
            rpcUrl: { type: "string" }
          }
        },
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            message: { type: "string", maxLength: 2000 },
            symbol: { type: "string", minLength: 3, maxLength: 32 },
            timeframe: { type: "string", minLength: 1, maxLength: 16 },
            chainId: { type: "number" },
            rpcUrl: { type: "string" },
            horizonMinutes: { type: "number", minimum: 1, maximum: 24 * 60 },
            modelVersion: { type: "string" },
            conversationId: { type: "string" },
            title: { type: "string", maxLength: 120 }
          }
        }
      }
    },
    async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.status(401).send({ message: "missing token" });
      }
      const token = authHeader.slice("Bearer ".length);
      const payload = verifyJwt(token);

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        return reply.status(401).send({ message: "user not found" });
      }

      if (!user.walletAddress) {
        return reply.status(400).send({ message: "wallet address required to access AI insights" });
      }

      const { chainId: queryChainId, rpcUrl: queryRpcUrl } = request.query as {
        chainId?: string;
        rpcUrl?: string;
      };
      const body = request.body as {
        message?: string;
        symbol?: string;
        timeframe?: string;
        chainId?: number;
        rpcUrl?: string;
        horizonMinutes?: number;
        modelVersion?: string;
        conversationId?: string;
        title?: string;
      };
      const chain = selectChainWithRpc(
        queryChainId ? Number(queryChainId) : body?.chainId,
        queryRpcUrl || body?.rpcUrl
      );

      const premium = await getPremiumStatus(user.walletAddress, {
        chainId: chain.chainId ?? chain.id,
        rpcUrl: chain.rpcUrl
      });
      if (!premium.eligible) {
        return reply.status(402).send({
          message: "premium access required (token balance or pass)",
          missing: premium.missing
        });
      }

      const symbol = body.symbol ?? "WBTC/USDT";
      const timeframe = body.timeframe ?? "1h";
      const horizonMinutes = body.horizonMinutes ?? 60;
      let conversationId = body.conversationId;
      if (!conversationId) {
        const conv = await createConversation(user.id, body.title);
        conversationId = conv.id;
      } else {
        const meta = await getConversation(conversationId);
        if (!meta || meta.userId !== user.id) {
          return reply.status(404).send({ message: "conversation not found" });
        }
      }

      const market = await prisma.market.findFirst({ where: { symbol, timeframe } });
      if (!market) {
        return reply.status(404).send({ message: "market not found" });
      }

      const access = await ensureActiveAccess(user.id, user.walletAddress, chain);

      const latestPrediction = await prisma.modelPrediction.findFirst({
        where: { marketId: market.id, timeframe },
        orderBy: { asOf: "desc" }
      });

      const latestIndicator = await prisma.indicatorSnapshot.findFirst({
        where: { marketId: market.id, timeframe },
        orderBy: { asOf: "desc" }
      });

      const candlesDesc = await prisma.candle.findMany({
        where: { marketId: market.id, timeframe },
        orderBy: { timestamp: "desc" },
        take: 300
      });
      const candles = candlesDesc
        .map((c) => ({
          timestamp: Number(c.timestamp),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume)
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      const lastClose = candles.length ? Number(candles[candles.length - 1].close) : null;

      const cachedPrediction = latestPrediction
        ? {
            requestId: latestPrediction.requestId ?? undefined,
            symbol,
            timeframe,
            horizonMinutes: latestPrediction.horizonMinutes,
            asOf: Number(latestPrediction.asOf),
            probabilities: latestPrediction.probabilities as Record<string, number>,
            regime: latestPrediction.regime as any,
            featureImportances: latestPrediction.featureImportances as any
          }
        : null;

      let aiResponse: Awaited<ReturnType<typeof callInference>> | null = null;
      const requestId = `chat-${Date.now()}`;
      if (hasLocalArtifacts(symbol, timeframe)) {
        try {
          aiResponse = await callInference({
            symbol,
          timeframe,
          horizonMinutes,
          candles,
          indicators: (latestIndicator?.data as any)?.series ?? [],
          modelVersion: body.modelVersion,
          requestId
        });
        } catch (err) {
          request.log.warn({ err, requestId }, "AI inference failed; falling back to cached prediction");
          aiResponse = cachedPrediction;
        }
      } else {
        request.log.info({ symbol, timeframe, requestId }, "Skipping AI inference (artifacts missing); using cache");
        aiResponse = cachedPrediction;
      }

      if (!aiResponse && !cachedPrediction) {
        return reply.status(503).send({
          message: "no AI insight available",
          reason: "missing_artifacts_and_cache",
          requestId
        });
      }

      // build history (last 20 messages) for LLM prompt
      const history = await listMessages(conversationId, 20);
      const priorMessages = history.map((m) => ({ role: m.role, content: m.content }));

      const historyText =
        priorMessages.length > 0
          ? `\n\nRecent conversation (most recent last):\n${priorMessages
              .map((m) => `${m.role}: ${m.content}`)
              .join("\n")}`
          : "";

      const contexts = [
        {
          symbol,
          timeframe,
          lastClose,
          indicators: {
            latest: (latestIndicator?.data as any)?.latest ?? null
          },
          prediction: aiResponse ?? cachedPrediction
        }
      ];

      let chatResult;
      try {
        chatResult = await callChat({
          message: `${body.message ?? ""}${historyText}`,
          system: config.CHAT_SYSTEM_PROMPT,
          contexts,
          model: undefined, // default model set by AI service
        });
      } catch (err) {
        request.log.warn({ err, symbol, timeframe, requestId }, "chat service unavailable; returning summary only");
        chatResult = {
          output: "Chat service temporarily unavailable; using latest AI summary.",
          model: "unavailable",
          requestId
        };
      }

      // persist user & assistant messages
      const now = Date.now();
      const userMsg: ConversationMessage = {
        id: `msg-${now}-u`,
        role: "user",
        content: body.message ?? "",
        createdAt: now
      };
      const assistantMsg: ConversationMessage = {
        id: `msg-${now}-a`,
        role: "assistant",
        content: chatResult.output,
        createdAt: Date.now()
      };
      await addMessage(conversationId, userMsg);
      await addMessage(conversationId, assistantMsg);

      const response = {
        userId: user.id,
        accessExpiresAt: access.expiresAt,
        message: body.message ?? "",
        summary: {
          symbol,
          timeframe,
          lastClose,
          probabilities: (aiResponse as any)?.probabilities ?? latestPrediction?.probabilities ?? null,
          regime: (aiResponse as any)?.regime ?? latestPrediction?.regime ?? null,
          indicators: (latestIndicator?.data as any)?.latest ?? null
        },
        ai: aiResponse,
        chat: chatResult,
        conversationId
      };

      return reply.send(response);
    }
  );

  // create conversation explicitly
  app.post(
    "/ai/conversations",
    { schema: { body: { type: "object", properties: { title: { type: "string", maxLength: 120 } }, additionalProperties: false } } },
    async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.status(401).send({ message: "missing token" });
      }
      const token = authHeader.slice("Bearer ".length);
      const payload = verifyJwt(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return reply.status(401).send({ message: "user not found" });
      const body = request.body as { title?: string };
      const conv = await createConversation(user.id, body.title);
      return reply.send(conv);
    }
  );

  // list conversations
  app.get("/ai/conversations", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "missing token" });
    }
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return reply.status(401).send({ message: "user not found" });
    const list = await listConversations(user.id, 20);
    return reply.send({ conversations: list });
  });

  // fetch conversation messages
  app.get("/ai/conversations/:id", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "missing token" });
    }
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return reply.status(401).send({ message: "user not found" });
    const id = (request.params as any).id;
    const meta = await getConversation(id);
    if (!meta || meta.userId !== user.id) return reply.status(404).send({ message: "conversation not found" });
    const messages = await listMessages(id, 50);
    return reply.send({ conversation: meta, messages });
  });
}
