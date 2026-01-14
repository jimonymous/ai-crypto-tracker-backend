import { FastifyInstance } from "fastify";
import { verifyJwt } from "../auth/jwt";
import { prisma } from "../db";
import { ensureActiveAccess } from "../billing/accessPass";
import { callBacktest, callInference, callTrain, callTrainDeep } from "../ai/client";
import { selectChainWithRpc } from "../chain/config";
import { IndicatorSeries } from "../types/shared";

const getUserOrReply = async (request: any, reply: any) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    await reply.status(401).send({ message: "missing token" });
    return null;
  }
  const token = authHeader.slice("Bearer ".length);
  const payload = verifyJwt(token);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    await reply.status(401).send({ message: "user not found" });
    return null;
  }
  if (!user.walletAddress) {
    await reply.status(400).send({ message: "wallet address required" });
    return null;
  }
  return user;
};

export default async function aiRoutes(app: FastifyInstance) {
  app.post(
    "/ai/infer",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            chainId: { type: "string" },
            rpcUrl: { type: "string" }
          }
        },
        body: {
          type: "object",
          required: ["symbol", "timeframe", "horizonMinutes", "candles"],
          properties: {
            symbol: { type: "string" },
            timeframe: { type: "string" },
            horizonMinutes: { type: "number" },
            asOf: { type: "number" },
            candles: { type: "array" },
            indicators: { type: "array" },
            modelVersion: { type: "string" },
            requestId: { type: "string" },
            chainId: { type: "number" },
            rpcUrl: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
    const user = await getUserOrReply(request, reply);
    if (!user) return;

    const { chainId: queryChainId, rpcUrl: queryRpcUrl } = request.query as {
      chainId?: string;
      rpcUrl?: string;
    };
    const body = request.body as any;
    const chain = selectChainWithRpc(
      queryChainId ? Number(queryChainId) : body?.chainId,
      queryRpcUrl || body?.rpcUrl
    );

    try {
      if (!body?.symbol || !body?.timeframe || !body?.horizonMinutes || !body?.candles) {
        return reply.status(400).send({ message: "symbol, timeframe, horizonMinutes, candles are required" });
      }
      await ensureActiveAccess(user.id, user.walletAddress ?? "", chain);
        const response = await callInference({
          symbol: body.symbol,
          timeframe: body.timeframe,
          horizonMinutes: body.horizonMinutes,
          asOf: body.asOf,
          candles: body.candles,
          indicators: body.indicators,
          modelVersion: body.modelVersion,
          requestId: body.requestId
        });
      return reply.send(response);
    } catch (err: any) {
      const status = err?.statusCode ?? 400;
      return reply.status(status).send({ message: err?.message ?? "inference failed" });
    }
    }
  );

  app.post(
    "/ai/train",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            chainId: { type: "string" },
            rpcUrl: { type: "string" }
          }
        },
        body: {
          type: "object",
          required: ["symbol", "timeframe", "horizonMinutes", "candles"],
          properties: {
            symbol: { type: "string" },
            timeframe: { type: "string" },
            horizonMinutes: { type: "number" },
            candles: { type: "array" },
            indicators: { type: "array" },
            test_size: { type: "number" },
            requestId: { type: "string" },
            chainId: { type: "number" },
            rpcUrl: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
    const user = await getUserOrReply(request, reply);
    if (!user) return;

    const { chainId: queryChainId, rpcUrl: queryRpcUrl } = request.query as {
      chainId?: string;
      rpcUrl?: string;
    };
    const body = request.body as any;
    const chain = selectChainWithRpc(
      queryChainId ? Number(queryChainId) : body?.chainId,
      queryRpcUrl || body?.rpcUrl
    );

    try {
      if (!body?.symbol || !body?.timeframe || !body?.horizonMinutes || !body?.candles) {
        return reply.status(400).send({ message: "symbol, timeframe, horizonMinutes, candles are required" });
      }
      await ensureActiveAccess(user.id, user.walletAddress ?? "", chain);
      const response = await callTrain({
        symbol: body.symbol,
        timeframe: body.timeframe,
        horizonMinutes: body.horizonMinutes,
        candles: body.candles,
        indicators: body.indicators,
        test_size: body.test_size,
        requestId: body.requestId
      });
      return reply.send(response);
    } catch (err: any) {
      const status = err?.statusCode ?? 400;
      return reply.status(status).send({ message: err?.message ?? "training failed" });
    }
    }
  );

  app.post(
    "/ai/train/from-db",
    {
      schema: {
        body: {
          type: "object",
          required: [],
          properties: {
            marketId: { type: "string" },
            timeframe: { type: "string" },
            horizonMinutes: { type: "number" },
            limit: { type: "number" },
            symbol: { type: "string" },
            all: { type: "boolean" }
          }
        }
      }
    },
    async (request, reply) => {
      const user = await getUserOrReply(request, reply);
      if (!user) return;

      const body = request.body as {
        marketId?: string;
        timeframe?: string;
        horizonMinutes?: number;
        limit?: number;
        symbol?: string;
        all?: boolean;
      };

      const horizon = body.horizonMinutes ?? 60;
      const limit = body.limit && body.limit > 0 ? Math.min(body.limit, 2000) : 600;
      const minSamples = 20;

      // Helper to train one market/timeframe
      const trainSingle = async (marketId: string, timeframe: string, symbol?: string) => {
        const market = await prisma.market.findUnique({ where: { id: marketId } });
        const resolvedSymbol = symbol || market?.symbol || marketId;

        const totalCandles = await prisma.candle.count({ where: { marketId, timeframe } });
        if (totalCandles < minSamples) {
          throw new Error(
            `not enough candles for ${marketId}/${timeframe} (need >=${minSamples}, have ${totalCandles})`
          );
        }
        const candles = await prisma.candle.findMany({
          where: { marketId, timeframe },
          orderBy: { timestamp: "desc" },
          take: limit
        });
        const candleCount = candles.length;
        const indicatorSnapshot = await prisma.indicatorSnapshot.findFirst({
          where: { marketId, timeframe },
          orderBy: { asOf: "desc" }
        });
        const indicatorsRaw = (indicatorSnapshot?.data as any)?.series;
        const indicators = Array.isArray(indicatorsRaw) ? (indicatorsRaw as IndicatorSeries[]) : [];

        const serialized = candles
          .map((c) => ({
            timestamp: Number(c.timestamp),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume)
          }))
          .sort((a, b) => a.timestamp - b.timestamp);

        try {
          const response = await callTrain({
            symbol: resolvedSymbol,
            timeframe,
            horizonMinutes: horizon,
            candles: serialized,
            indicators
          });
          return {
            ...response,
            marketId,
            timeframe,
            candleCount: serialized.length,
            indicatorCount: indicators.length
          };
        } catch (err: any) {
          const message = err?.message ?? "training failed";
          const e: any = new Error(`${message} (candles=${serialized.length}, indicators=${indicators.length})`);
          e.candleCount = serialized.length;
          e.indicatorCount = indicators.length;
          throw e;
        }
      };

      // If "all" flag set, train every market/timeframe that has candles.
      if (body.all) {
        const combos = await prisma.candle.groupBy({
          by: ["marketId", "timeframe"],
          _count: { _all: true }
        });
        const marketIndex = new Map(
          (await prisma.market.findMany({ select: { id: true, symbol: true } })).map((m) => [m.id, m.symbol])
        );

        const results: any[] = [];
        for (const combo of combos) {
          const candleCount = combo._count._all;
          if ((combo.timeframe || "").endsWith("s")) {
            results.push({
              marketId: combo.marketId,
              timeframe: combo.timeframe,
              ok: false,
              symbol: marketIndex.get(combo.marketId) ?? combo.marketId,
              message: "skipped: sub-minute timeframe not trained",
              candleCount
            });
            continue;
          }
          if (combo._count._all < minSamples) {
            results.push({
              marketId: combo.marketId,
              timeframe: combo.timeframe,
              ok: false,
              symbol: marketIndex.get(combo.marketId) ?? combo.marketId,
              message: `skipped: ${combo._count._all} samples (<${minSamples})`,
              candleCount
            });
            continue;
          }
          try {
            const res = await trainSingle(combo.marketId, combo.timeframe);
            results.push({
              ok: true,
              ...res,
              symbol: res.symbol ?? marketIndex.get(combo.marketId) ?? combo.marketId
            });
          } catch (err: any) {
            results.push({
              marketId: combo.marketId,
              timeframe: combo.timeframe,
              ok: false,
              symbol: marketIndex.get(combo.marketId) ?? combo.marketId,
              message: err?.message ?? "train failed"
            });
          }
        }
        const trained = results.filter((r) => r.ok).length;
        return reply.send({ trained, total: results.length, results });
      }

      // Single-market path (original behavior)
      if (!body.marketId || !body.timeframe) {
        return reply.status(400).send({ message: "marketId and timeframe are required (or set all=true)" });
      }

      try {
        const response = await trainSingle(body.marketId, body.timeframe, body.symbol);
        return reply.send(response);
      } catch (err: any) {
        const status = err?.statusCode ?? 400;
        return reply.status(status).send({ message: err?.message ?? "training failed" });
      }
    }
  );

  app.post(
    "/ai/train/deep",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            chainId: { type: "string" },
            rpcUrl: { type: "string" }
          }
        },
        body: {
          type: "object",
          required: ["symbol", "timeframe", "horizonMinutes", "candles"],
          properties: {
            symbol: { type: "string" },
            timeframe: { type: "string" },
            horizonMinutes: { type: "number" },
            candles: { type: "array" },
            indicators: { type: "array" },
            test_size: { type: "number" },
            requestId: { type: "string" },
            chainId: { type: "number" },
            rpcUrl: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
    const user = await getUserOrReply(request, reply);
    if (!user) return;

    const { chainId: queryChainId, rpcUrl: queryRpcUrl } = request.query as {
      chainId?: string;
      rpcUrl?: string;
    };
    const body = request.body as any;
    const chain = selectChainWithRpc(
      queryChainId ? Number(queryChainId) : body?.chainId,
      queryRpcUrl || body?.rpcUrl
    );

    try {
      if (!body?.symbol || !body?.timeframe || !body?.horizonMinutes || !body?.candles) {
        return reply.status(400).send({ message: "symbol, timeframe, horizonMinutes, candles are required" });
      }
      await ensureActiveAccess(user.id, user.walletAddress ?? "", chain);
      const response = await callTrainDeep({
        symbol: body.symbol,
        timeframe: body.timeframe,
        horizonMinutes: body.horizonMinutes,
        candles: body.candles,
        indicators: body.indicators,
        test_size: body.test_size,
        requestId: body.requestId
      });
      return reply.send(response);
    } catch (err: any) {
      const status = err?.statusCode ?? 400;
      return reply.status(status).send({ message: err?.message ?? "deep training failed" });
    }
    }
  );

  app.post(
    "/ai/backtest",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            chainId: { type: "string" },
            rpcUrl: { type: "string" }
          }
        },
        body: {
          type: "object",
          required: ["symbol", "timeframe", "horizonMinutes", "candles"],
          properties: {
            symbol: { type: "string" },
            timeframe: { type: "string" },
            horizonMinutes: { type: "number" },
            candles: { type: "array" },
            indicators: { type: "array" },
            test_size: { type: "number" },
            requestId: { type: "string" },
            chainId: { type: "number" },
            rpcUrl: { type: "string" }
          }
        }
      }
    },
    async (request, reply) => {
    const user = await getUserOrReply(request, reply);
    if (!user) return;

    const { chainId: queryChainId, rpcUrl: queryRpcUrl } = request.query as {
      chainId?: string;
      rpcUrl?: string;
    };
    const body = request.body as any;
    const chain = selectChainWithRpc(
      queryChainId ? Number(queryChainId) : body?.chainId,
      queryRpcUrl || body?.rpcUrl
    );

    try {
      if (!body?.symbol || !body?.timeframe || !body?.horizonMinutes || !body?.candles) {
        return reply.status(400).send({ message: "symbol, timeframe, horizonMinutes, candles are required" });
      }
      await ensureActiveAccess(user.id, user.walletAddress ?? "", chain);
      const response = await callBacktest({
        symbol: body.symbol,
        timeframe: body.timeframe,
        horizonMinutes: body.horizonMinutes,
        candles: body.candles,
        indicators: body.indicators,
        test_size: body.test_size,
        requestId: body.requestId
      });
      return reply.send(response);
    } catch (err: any) {
      const status = err?.statusCode ?? 400;
      return reply.status(status).send({ message: err?.message ?? "backtest failed" });
    }
    }
  );
}
