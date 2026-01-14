import { FastifyInstance } from "fastify";
import { getDexChain, isAllowedChain, isAllowedToken } from "../dex/config";
import { getCachedQuote } from "../dex/aggregators";
import { fetchOnChainSpot } from "../dex/onchain";
import { config } from "../config";

const parseQuery = (query: any) => {
  const chainId = query.chainId ? Number(query.chainId) : 1;
  const sellToken = (query.sellToken as string) || "";
  const buyToken = (query.buyToken as string) || "";
  const amount = (query.amount as string) || "1000000000000000000"; // 1 token (wei)
  return { chainId, sellToken, buyToken, amount };
};

const validateTokens = (chainId: number, sellToken: string, buyToken: string) => {
  if (!isAllowedChain(chainId)) return "unsupported chain";
  if (!isAllowedToken(chainId, sellToken) || !isAllowedToken(chainId, buyToken)) return "token not allowlisted";
  return null;
};

const getQuote = async (chainId: number, sellToken: string, buyToken: string, amount: string) => {
  const chain = getDexChain(chainId);
  if (!chain) throw new Error("chain not configured");
  const agg = await getCachedQuote(chain, sellToken, buyToken, amount);
  if (agg) return agg;
  return fetchOnChainSpot(chainId, sellToken, buyToken);
};

const shelfLifeMs = (quote?: Awaited<ReturnType<typeof getQuote>>): number | null => {
  if (!quote?.fetchedAt || !quote?.ttlSeconds) return null;
  const expiresAt = quote.fetchedAt + quote.ttlSeconds * 1000;
  const ms = expiresAt - Date.now();
  return ms > 0 ? ms : 0;
};

export default async function dexRoutes(app: FastifyInstance) {
  app.get(
    "/dex/quote",
    { config: { rateLimit: { max: 20, timeWindow: 10_000 } } },
    async (request, reply) => {
      const q = request.query as any;
      const { chainId, sellToken, buyToken, amount } = parseQuery(q);
      const err = validateTokens(chainId, sellToken, buyToken);
      if (err) return reply.status(400).send({ message: err });
      const quote = await getQuote(chainId, sellToken, buyToken, amount);
      if (!quote) return reply.status(404).send({ message: "quote unavailable" });
      return reply.send({ chainId, sellToken, buyToken, amount, ...quote });
    }
  );

  app.get(
    "/dex/pools",
    { config: { rateLimit: { max: 20, timeWindow: 10_000 } } },
    async (request, reply) => {
      const q = request.query as any;
      const chainId = q?.chainId ? Number(q.chainId) : 1;
      const chain = getDexChain(chainId);
      if (!chain) return reply.status(400).send({ message: "unsupported chain" });
      return reply.send({ chainId, pools: chain.pools, tokens: chain.tokens });
    }
  );

  app.get(
    "/dex/depth",
    { config: { rateLimit: { max: 20, timeWindow: 10_000 } } },
    async (request, reply) => {
      const q = request.query as any;
      const chainId = q?.chainId ? Number(q.chainId) : 1;
      const poolAddress = (q?.poolAddress as string) || "";
      const chain = getDexChain(chainId);
      if (!chain) return reply.status(400).send({ message: "unsupported chain" });
      const pool = chain.pools.find((p) => p.address.toLowerCase() === poolAddress.toLowerCase());
      if (!pool) return reply.status(404).send({ message: "pool not allowlisted" });
      const price = await fetchOnChainSpot(chainId, pool.token0, pool.token1);
      return reply.send({ chainId, pool, spot: price?.price ?? null, source: price?.source ?? null });
    }
  );

  app.get(
    "/arb/opportunities",
    { config: { rateLimit: { max: 10, timeWindow: 10_000 } } },
    async (request, reply) => {
      const { chainId, sellToken, buyToken, amount } = parseQuery(request.query);
      const err = validateTokens(chainId, sellToken, buyToken);
      if (err) return reply.status(400).send({ message: err });
      const forward = await getQuote(chainId, sellToken, buyToken, amount);
      const backward = await getQuote(chainId, buyToken, sellToken, amount);
      if (!forward || !backward || !forward.price || !backward.price) {
        return reply.send({ chainId, opportunities: [] });
      }
      const roundTrip = forward.price * backward.price;
      const profitPct = roundTrip - 1;
      if (profitPct <= 0.001) {
        return reply.send({ chainId, opportunities: [] });
      }
      const route = {
        profitPct,
        legs: [
          { from: sellToken, to: buyToken, source: forward.source, expectedPrice: forward.price },
          { from: buyToken, to: sellToken, source: backward.source, expectedPrice: backward.price }
        ],
        calldata: [
          {
            to: forward.raw?.to ?? null,
            data: forward.raw?.data ?? null,
            description: "Unsigned call for user to submit (forward leg)"
          },
          {
            to: backward.raw?.to ?? null,
            data: backward.raw?.data ?? null,
            description: "Unsigned call for user to submit (reverse leg)"
          }
        ],
        shelfLifeMs: (() => {
          const lifetimes = [shelfLifeMs(forward), shelfLifeMs(backward)].filter(
            (v): v is number => v != null
          );
          if (!lifetimes.length) return null;
          return Math.min(...lifetimes);
        })()
      };
      return reply.send({ chainId, opportunities: [route] });
    }
  );
}
