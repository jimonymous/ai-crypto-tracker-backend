import { FastifyInstance } from "fastify";
import { createPublicClient, http } from "viem";
import { getDexChain, isAllowedChain, isAllowedToken, findToken } from "../dex/config";
import { fetchOnChainSpot, makeClient } from "../dex/onchain";

const buildBlockNumbers = async (
  chainId: number,
  rpcUrl: string,
  windowMinutes: number,
  intervalSeconds: number,
  maxBlocks: number
): Promise<{ blocks: bigint[]; timestamps: Map<bigint, number> }> => {
  const client = createPublicClient({
    chain: {
      id: chainId,
      name: String(chainId),
      network: String(chainId),
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } }
    },
    transport: http(rpcUrl)
  });
  const latest = await client.getBlock();
  const latestNumber = latest.number;
  const latestTs = Number(latest.timestamp) * 1000;
  const cutoff = latestTs - windowMinutes * 60 * 1000;

  const blocks: bigint[] = [];
  const timestamps = new Map<bigint, number>();

  let bn = latestNumber;
  let failures = 0;
  let lastIncludedTs = latestTs;

  while (bn > 0n && blocks.length < maxBlocks) {
    try {
      const b = await client.getBlock({ blockNumber: bn });
      const ts = Number(b.timestamp) * 1000;
      if (ts < cutoff) break;
      const delta = Math.abs(lastIncludedTs - ts);
      if (blocks.length === 0 || delta >= intervalSeconds * 1000) {
        blocks.push(bn);
        timestamps.set(bn, ts);
        lastIncludedTs = ts;
      }
      failures = 0;
    } catch {
      failures += 1;
      if (failures >= 10) break; // stop if provider keeps failing
    }
    bn = bn - 1n;
  }

  blocks.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { blocks, timestamps };
};

export default async function dexHistoryRoutes(app: FastifyInstance) {
  app.get(
    "/dex/history",
    { config: { rateLimit: { max: 10, timeWindow: 10_000 } } },
    async (request, reply) => {
      const q = request.query as any;
      const chainId = q?.chainId ? Number(q.chainId) : 1;
      const sellToken = (q?.sellToken as string) || "";
      const buyToken = (q?.buyToken as string) || "";
      const windowMinutes = q?.windowMinutes ? Number(q.windowMinutes) : 60;
      const intervalSeconds = q?.intervalSeconds ? Number(q.intervalSeconds) : 60;
      const minSamples = q?.minSamples ? Number(q.minSamples) : 3;
      const maxBlocks = q?.maxBlocks ? Number(q.maxBlocks) : 500;

      if (!isAllowedChain(chainId)) return reply.status(400).send({ message: "unsupported chain" });
      if (!isAllowedToken(chainId, sellToken) || !isAllowedToken(chainId, buyToken)) {
        return reply.status(400).send({ message: "token not allowlisted" });
      }

      const chain = getDexChain(chainId);
      if (!chain) return reply.status(400).send({ message: "unsupported chain" });

      const { blocks, timestamps } = await buildBlockNumbers(
        chainId,
        chain.rpcUrl,
        windowMinutes,
        intervalSeconds,
        maxBlocks
      );
      const samples: { blockNumber: string; ts: number; price: number; source: string }[] = [];

      for (const bn of blocks) {
        let spot = await fetchOnChainSpot(chainId, sellToken, buyToken, bn);
        // If historical block read fails (rate limit/provider), fall back to latest
        if (!spot?.price) {
          spot = await fetchOnChainSpot(chainId, sellToken, buyToken);
        }
        if (spot?.price) {
          samples.push({
            blockNumber: bn.toString(),
            ts: timestamps.get(bn) ?? Date.now(),
            price: spot.price,
            source: spot.source ?? "onchain"
          });
        }
      }

      // Ensure at least minSamples attempts by topping up with latest prices if historical reads were sparse
      while (samples.length < Math.max(1, minSamples)) {
        const spot = await fetchOnChainSpot(chainId, sellToken, buyToken);
        if (!spot?.price) break;
        samples.push({
          blockNumber: "latest",
          ts: Date.now(),
          price: spot.price,
          source: spot.source ?? "onchain"
        });
      }

      return reply.send({
        chainId,
        sellToken,
        buyToken,
        windowMinutes,
        intervalSeconds,
        minSamples,
        maxBlocks,
        samples
      });
    }
  );
}
