import { FastifyInstance } from "fastify";
import { findCycles } from "../dex/cycles";
import { isAllowedChain, getDexChain, findToken } from "../dex/config";

const parseNumber = (val: any, fallback: number) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
};

const parseList = (val?: string) =>
  val
    ?.split(",")
    .map((v) => v.trim())
    .filter(Boolean) ?? [];

export default async function arbRoutes(app: FastifyInstance) {
  app.get(
    "/arb/cycles",
    { config: { rateLimit: { max: 5, timeWindow: 10_000 } } },
    async (request, reply) => {
      const { chainIds, tokens, bases, maxHops, maxBankroll, minProfitPct, minProfitAbs, amount } = request.query as any;
      const parsedChains = parseList(chainIds).map((c) => Number(c)).filter((c) => Number.isFinite(c));
      const chains = parsedChains.length ? parsedChains : [1];
      const tokenList = parseList(tokens);
      const baseList = parseList(bases);
      const hopLimit = parseNumber(maxHops, 3);
      if (hopLimit < 3) return reply.status(400).send({ message: "maxHops must be >= 3" });
      const bankroll = parseNumber(maxBankroll, 1000);
      const minPct = parseNumber(minProfitPct, 0.001);
      const minAbs = parseNumber(minProfitAbs, 0);
      const slippageBps = parseNumber((request.query as any).slippageBps, 0);
      const amt = (amount as string) || "1000000000000000000";

      const results: any[] = [];
      for (const chainId of chains) {
        if (!isAllowedChain(chainId)) continue;
        const chain = getDexChain(chainId);
        const chainTokens = chain?.tokens.map((t) => t.address.toLowerCase()) ?? [];
        const tokensForChain = (tokenList.length ? tokenList : chainTokens).map(
          (t) => findToken(chain!, t)?.address.toLowerCase() ?? t.toLowerCase()
        );
        // restrict tokens to provided bases if any
        const basesForChain = (baseList.length ? baseList : tokensForChain).map(
          (b) => findToken(chain!, b)?.address.toLowerCase() ?? b.toLowerCase()
        );
        const usableTokens = tokensForChain;
        if (usableTokens.length < 3) continue;
        const opps = await findCycles({
          chainId,
          tokens: usableTokens,
          bases: basesForChain,
          amount: amt,
          minProfitPct: minPct,
          maxBankroll: bankroll,
          minProfitAbs: minAbs,
          slippageBps
        });
        results.push(...opps);
      }

      return reply.send({ opportunities: results });
    }
  );
}
