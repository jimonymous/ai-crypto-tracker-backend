import { FastifyInstance } from "fastify";
import { getDexChain, isAllowedChain, isAllowedToken } from "../dex/config";
import { buildCandlesForPair } from "../dex/candleBuilder";

export default async function dexCandlesRoutes(app: FastifyInstance) {
  app.get(
    "/dex/candles",
    { config: { rateLimit: { max: 10, timeWindow: 10_000 } } },
    async (request, reply) => {
      const q = request.query as any;
      const chainId = q?.chainId ? Number(q.chainId) : 1;
      const poolAddress = (q?.poolAddress as string) || "";
      const sellToken = (q?.sellToken as string) || "";
      const buyToken = (q?.buyToken as string) || "";
      const windowMinutes = q?.windowMinutes ? Number(q.windowMinutes) : 60;
      const intervalSeconds = q?.intervalSeconds ? Number(q.intervalSeconds) : 60;
      const minSamples = q?.minSamples ? Number(q.minSamples) : 3;
      const maxBlocks = q?.maxBlocks ? Number(q.maxBlocks) : 500;
      const creationBlock = q?.creationBlock ? BigInt(q.creationBlock) : undefined;

      if (!isAllowedChain(chainId)) return reply.status(400).send({ message: "unsupported chain" });
      const chain = getDexChain(chainId);
      if (!chain) return reply.status(400).send({ message: "unsupported chain" });

      // Allow either explicit token pair or an allowlisted pool address
      let t0 = sellToken;
      let t1 = buyToken;
      if (poolAddress) {
        const pool = chain.pools.find(
          (p) => p.address.toLowerCase() === poolAddress.toLowerCase()
        );
        if (!pool) return reply.status(404).send({ message: "pool not allowlisted" });
        t0 = pool.token0;
        t1 = pool.token1;
      }

      if (!isAllowedToken(chainId, t0) || !isAllowedToken(chainId, t1)) {
        return reply.status(400).send({ message: "token not allowlisted" });
      }

      const { candles, candleCount } = await buildCandlesForPair({
        chainId,
        sellToken: t0,
        buyToken: t1,
        windowMinutes,
        intervalSeconds,
        minSamples,
        maxBlocks,
        creationBlock,
        poolAddress
      });

      return reply.send({
        chainId,
        sellToken: t0,
        buyToken: t1,
        poolAddress: poolAddress || null,
        windowMinutes,
        intervalSeconds,
        minSamples,
        maxBlocks,
        candleCount,
        candles
      });
    }
  );
}
