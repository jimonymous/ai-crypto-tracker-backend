import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import marketsRoutes from "./markets";

const prismaMock = vi.hoisted(() => ({
  market: { findMany: vi.fn() },
  candle: { findFirst: vi.fn(), findMany: vi.fn() }
}));

vi.mock("../db", () => ({ prisma: prismaMock }));

describe("marketsRoutes", () => {
  const buildApp = async () => {
    const app = Fastify();
    await app.register(marketsRoutes);
    await app.ready();
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.market.findMany.mockResolvedValue([
      { id: "m1", symbol: "BTC/USDT", baseAsset: "BTC", quoteAsset: "USDT" },
      { id: "m2", symbol: "ETH/USDT", baseAsset: "ETH", quoteAsset: "USDT" }
    ]);
    prismaMock.candle.findFirst.mockResolvedValue({
      close: 20000,
      timestamp: BigInt(Date.now())
    });
    prismaMock.candle.findMany.mockResolvedValue([
      { volume: 10, close: 19000, timestamp: BigInt(Date.now() - 1_000_000) },
      { volume: 20, close: 20000, timestamp: BigInt(Date.now()) }
    ]);
  });

  it("returns market summaries", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/markets" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ symbol: "BTC/USDT", baseAsset: "BTC", quoteAsset: "USDT" });
    expect(body[0].volume24h).toBeGreaterThan(0);
  });

  it("returns stats with btc dominance and trending", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/markets/stats" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalVolume24h).toBeGreaterThan(0);
    expect(body.btcDominance).toBeGreaterThan(0);
    expect(body.trending.length).toBeGreaterThan(0);
  });
});
