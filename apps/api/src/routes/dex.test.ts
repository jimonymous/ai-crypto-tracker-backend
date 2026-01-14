import { vi, beforeEach, describe, expect, it } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
});

import Fastify from "fastify";

vi.mock("../redis", () => {
  const store = new Map<string, string>();
  return {
    redis: {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
      })
    }
  };
});

import dexRoutes from "./dex";

const USDC = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

describe("dex routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns a 0x quote when available", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        price: "0.001",
        buyAmount: "1000",
        sellAmount: "1000000",
        estimatedGas: 100000,
        to: "0xrouter",
        data: "0x1234"
      })
    });
    vi.stubGlobal("fetch", fetchMock as any);

    const app = Fastify();
    await app.register(dexRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: `/dex/quote?chainId=1&sellToken=${USDC}&buyToken=${WETH}&amount=1000000`
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toBe("0x");
    expect(body.price).toBeCloseTo(0.001, 6);
  });

  it("rejects non-allowlisted tokens", async () => {
    const app = Fastify();
    await app.register(dexRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/dex/quote?chainId=1&sellToken=0xdead&buyToken=0xbeef&amount=1"
    });
    expect(res.statusCode).toBe(400);
  });

  it("surfaces arb opportunity when spread exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          price: "2",
          buyAmount: "200",
          sellAmount: "100",
          to: "0xrouterA",
          data: "0xaaaa"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          price: "0.6",
          buyAmount: "60",
          sellAmount: "100",
          to: "0xrouterB",
          data: "0xbbbb"
        })
      });
    vi.stubGlobal("fetch", fetchMock as any);

    const app = Fastify();
    await app.register(dexRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: `/arb/opportunities?chainId=1&sellToken=${USDC}&buyToken=${WETH}&amount=1000000`
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.opportunities)).toBe(true);
    expect(body.opportunities.length).toBeGreaterThan(0);
    expect(body.opportunities[0].legs.length).toBe(2);
    expect(body.opportunities[0].shelfLifeMs).toBeGreaterThan(0);
  });
});
