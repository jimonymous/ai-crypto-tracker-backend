import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import arbRoutes from "./arb";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgres://test";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.JWT_SECRET = "secret";
  process.env.CHAIN_RPC_URL = "http://localhost:8545";
});

const mockQuotes: Record<string, number> = {
  // USDC -> WETH -> USDT -> USDC (v2 allowlisted path)
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48->0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 2, // USDC -> WETH
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2->0xdac17f958d2ee523a2206206994597c13d831ec7": 1.5, // WETH -> USDT
  "0xdac17f958d2ee523a2206206994597c13d831ec7->0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 0.4 // USDT -> USDC
};

vi.mock("../dex/aggregators", () => ({
  getCachedQuote: vi.fn(async (_chain: any, from: string, to: string) => {
    const key = `${from.toLowerCase()}->${to.toLowerCase()}`;
    const price = mockQuotes[key];
    if (!price) return null;
    return { source: "fallback", price, fetchedAt: Date.now(), ttlSeconds: 30 } as any;
  })
}));

vi.mock("../dex/onchain", () => ({
  fetchOnChainSpot: vi.fn(async (_chainId: number, from: string, to: string) => {
    const key = `${from.toLowerCase()}->${to.toLowerCase()}`;
    const price = mockQuotes[key];
    if (!price) return null;
    return { source: "fallback", price, fetchedAt: Date.now(), ttlSeconds: 5 };
  })
}));

describe("arb cycles route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const buildApp = async () => {
    const app = Fastify();
    await app.register(arbRoutes);
    await app.ready();
    return app;
  };

  it("returns profitable cycles with shelf life and bankroll guidance", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url:
        "/arb/cycles?chainIds=1&tokens=USDC,WETH,USDT&bases=USDC&amount=1000000&maxBankroll=1000&minProfitPct=0.001&minProfitAbs=1&slippageBps=0"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.opportunities.length).toBeGreaterThan(0);
    const opp = body.opportunities[0];
    expect(opp.profitPct).toBeGreaterThan(0.01);
    expect(opp.shelfLifeMs).toBeGreaterThan(0);
    expect(opp.expectedProfit).toBeGreaterThan(0);
    expect(opp.minBankrollForTarget).toBeGreaterThan(0);
    expect(opp.path.length).toBe(4); // cycle closes
    const mcData = opp.multicall?.data;
    if (mcData) {
      expect(mcData).toMatch(/^0x/);
    }
  });

  it("returns empty when no profit after slippage", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url:
        "/arb/cycles?chainIds=1&tokens=USDC,WETH,DAI&amount=1000000&maxBankroll=1000&minProfitPct=0.5&slippageBps=500"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.opportunities.length).toBe(0);
  });

  it("skips unsupported chains and invalid tokens", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/arb/cycles?chainIds=999,tokens=FAKE1,FAKE2,FAKE3"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.opportunities.length).toBe(0);
  });

  it("returns empty when bases exclude all tokens", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url:
        "/arb/cycles?chainIds=1&tokens=USDC,WETH,DAI&bases=UNI&amount=1000000&maxBankroll=1000&minProfitPct=0.01"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.opportunities.length).toBe(0);
  });
});
