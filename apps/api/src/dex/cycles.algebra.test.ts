import { describe, expect, it, vi } from "vitest";

vi.mock("./aggregators", () => ({
  getCachedQuote: vi.fn(async () => ({
    source: "mock",
    price: 2,
    fetchedAt: Date.now(),
    ttlSeconds: 30,
    raw: { to: "0xrouter", data: "0x1234" }
  }))
}));

vi.mock("./onchain", () => ({
  fetchOnChainSpot: vi.fn(async () => null)
}));

vi.mock("./config", () => {
  const chain = {
    chainId: 1,
    name: "ethereum",
    rpcUrl: "http://localhost",
    routers: { v2Router: "0xrouter" },
    tokens: [
      { symbol: "A", address: "0x0000000000000000000000000000000000000001", decimals: 18 },
      { symbol: "B", address: "0x0000000000000000000000000000000000000002", decimals: 18 },
      { symbol: "C", address: "0x0000000000000000000000000000000000000003", decimals: 18 }
    ],
    pools: [
      {
        address: "0x0000000000000000000000000000000000000010",
        token0: "0x0000000000000000000000000000000000000001",
        token1: "0x0000000000000000000000000000000000000002",
        kind: "algebra" as const
      },
      {
        address: "0x0000000000000000000000000000000000000011",
        token0: "0x0000000000000000000000000000000000000002",
        token1: "0x0000000000000000000000000000000000000003",
        kind: "algebra" as const
      },
      {
        address: "0x0000000000000000000000000000000000000012",
        token0: "0x0000000000000000000000000000000000000003",
        token1: "0x0000000000000000000000000000000000000001",
        kind: "algebra" as const
      }
    ],
    aggregators: {}
  };
  return {
    getDexChain: () => chain,
    isAllowedToken: () => true,
    findToken: (_c: any, a: string) => ({ symbol: "X", address: a, decimals: 18 })
  };
});

describe("cycles with algebra pools", () => {
  it("builds a multicall for algebra/v2-compatible paths", async () => {
    const { findCycles } = await import("./cycles");
    const opps = await findCycles({
      chainId: 1,
      tokens: [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000003"
      ],
      bases: [],
      amount: "1000000000000000000",
      minProfitPct: 0,
      maxBankroll: 1000,
      minProfitAbs: 0,
      slippageBps: 0
    });
    expect(opps.length).toBeGreaterThan(0);
    const mc = opps[0].multicall;
    expect(mc?.data?.startsWith("0x")).toBe(true);
    expect(mc?.to.toLowerCase()).toBe("0xrouter");
  });
});
