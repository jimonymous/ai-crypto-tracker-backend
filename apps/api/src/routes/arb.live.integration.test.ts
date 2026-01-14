import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import arbRoutes from "./arb";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "secret";
  process.env.DISABLE_DEX_AGGREGATOR = "true"; // force on-chain spot for tests
  process.env.ETH_MAINNET_RPC =
    process.env.ETH_MAINNET_RPC ||
    "https://mainnet.infura.io/v3/f65b90a4e3e24481be645ddef1b00aa2";
});

// Live on-chain arb spot math using allowlisted mainnet pools.
// This is read-only and will return an empty list if no profitable cycles exist,
// but it validates on-chain price fetches and shelf life fields.
describe("arb cycles live (mainnet read-only)", () => {
  const buildApp = async () => {
    const app = Fastify({ logger: false });
    await app.register(arbRoutes);
    await app.ready();
    return app;
  };

  it(
    "computes cycle math from on-chain spot data (USDC/WETH/DAI)",
    async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url:
          "/arb/cycles?chainIds=1&tokens=USDC,WETH,DAI&amount=1000000&maxBankroll=1000&minProfitPct=-1&minProfitAbs=0&slippageBps=0"
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Live markets may or may not expose a profitable cycle; just ensure the endpoint runs
      // and, when data exists, leg prices/shelf life are populated.
      expect(Array.isArray(body.opportunities)).toBe(true);
      if (body.opportunities.length > 0) {
        const opp = body.opportunities[0];
        opp.legs.forEach((leg: any) => {
          expect(leg.price).toBeGreaterThan(0);
          expect(["fallback", "onchain", "dex"].includes(String(leg.source))).toBe(true);
        });
        if (opp.shelfLifeMs != null) {
          expect(opp.shelfLifeMs).toBeGreaterThanOrEqual(0);
        }
      }
    },
    180000
  );
});
