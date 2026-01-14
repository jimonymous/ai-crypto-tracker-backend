import { FastifyInstance } from "fastify";
import { getDexChain, isAllowedChain, isAllowedToken } from "../dex/config";
import { fetchOnChainSpot } from "../dex/onchain";
import { buildBlockNumbers } from "../dex/candleBuilder";

export default async function arbHistoryRoutes(app: FastifyInstance) {
  app.get(
    "/arb/history",
    { config: { rateLimit: { max: 5, timeWindow: 10_000 } } },
    async (request, reply) => {
      const q = request.query as any;
      const chainId = q?.chainId ? Number(q.chainId) : 1;
      const tokens = (q?.tokens as string)?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
      const windowMinutes = q?.windowMinutes ? Number(q.windowMinutes) : 60;
      const intervalSeconds = q?.intervalSeconds ? Number(q.intervalSeconds) : 60;
      const minProfitPct = q?.minProfitPct ? Number(q.minProfitPct) : 0.001;

      if (!isAllowedChain(chainId)) return reply.status(400).send({ message: "unsupported chain" });
      if (tokens.length < 3) return reply.status(400).send({ message: "at least 3 tokens required" });
      const [a, b, c] = tokens;
      for (const t of [a, b, c]) {
        if (!isAllowedToken(chainId, t)) return reply.status(400).send({ message: `token not allowlisted: ${t}` });
      }
      const chain = getDexChain(chainId);
      if (!chain) return reply.status(400).send({ message: "unsupported chain" });

      const { blocks, timestamps } = await buildBlockNumbers(
        chainId,
        chain.rpcUrl,
        windowMinutes,
        intervalSeconds,
        500,
        undefined
      );
      const events: any[] = [];
      for (const bn of blocks) {
        const [ab, bc, ca] = await Promise.all([
          fetchOnChainSpot(chainId, a, b, bn),
          fetchOnChainSpot(chainId, b, c, bn),
          fetchOnChainSpot(chainId, c, a, bn)
        ]);
        if (!ab?.price || !bc?.price || !ca?.price) continue;
        const product = ab.price * bc.price * ca.price;
        const profitPct = product - 1;
        events.push({
          blockNumber: bn.toString(),
          ts: timestamps.get(bn) ?? Date.now(),
          profitPct,
          meetsTarget: profitPct >= minProfitPct,
          legs: [
            { from: a, to: b, price: ab.price, source: ab.source },
            { from: b, to: c, price: bc.price, source: bc.source },
            { from: c, to: a, price: ca.price, source: ca.source }
          ]
        });
      }

      return reply.send({
        chainId,
        tokens: [a, b, c],
        windowMinutes,
        intervalSeconds,
        minProfitPct,
        events
      });
    }
  );
}
