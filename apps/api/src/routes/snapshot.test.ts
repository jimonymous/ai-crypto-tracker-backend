import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import snapshotRoutes from "./snapshot";

const prismaMock = vi.hoisted(() => ({
  market: { findFirst: vi.fn() },
  candle: { findMany: vi.fn() },
  indicatorSnapshot: { findFirst: vi.fn() },
  modelPrediction: { findFirst: vi.fn() }
}));

const redisMock = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../redis", () => ({ redis: redisMock }));

describe("snapshotRoutes /snapshot", () => {
  const buildApp = async () => {
    const app = Fastify();
    await app.register(snapshotRoutes);
    await app.ready();
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.market.findFirst.mockResolvedValue({
      id: "m1",
      symbol: "BTC/USDT",
      timeframe: "1h"
    });
    prismaMock.candle.findMany.mockResolvedValue([
      { timestamp: new Date("2024-01-01T01:00:00Z"), open: 2, high: 3, low: 1, close: 2.5, volume: 12 },
      { timestamp: new Date("2024-01-01T00:00:00Z"), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }
    ]);
    prismaMock.indicatorSnapshot.findFirst.mockResolvedValue({
      data: { series: [{ name: "ema", values: [1, 2] }] }
    });
    prismaMock.modelPrediction.findFirst.mockResolvedValue(null);
    redisMock.get.mockResolvedValue(null);
  });

  it("returns 400 when symbol is missing", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/snapshot" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when market is not found", async () => {
    prismaMock.market.findFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/snapshot?symbol=ETH/USDT&timeframe=1h" });
    expect(res.statusCode).toBe(404);
  });

  it("returns snapshot with cached prediction when present", async () => {
    redisMock.get.mockResolvedValue(
      JSON.stringify({ symbol: "BTC/USDT", probabilities: { pUp: 0.7 }, regime: { label: "bull" } })
    );
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/snapshot?symbol=BTC/USDT&timeframe=1h" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.symbol).toBe("BTC/USDT");
    expect(body.candles.length).toBe(2);
    expect(body.candles[0].timestamp).toBeLessThan(body.candles[1].timestamp); // sorted asc
    expect(body.indicators[0].name).toBe("ema");
    expect(body.ai.probabilities.pUp).toBe(0.7);
  });

  it("falls back to DB prediction when cache is empty", async () => {
    redisMock.get.mockResolvedValue(null);
    prismaMock.modelPrediction.findFirst.mockResolvedValue({
      requestId: "req-1",
      horizonMinutes: 60,
      asOf: new Date("2024-01-01T02:00:00Z"),
      probabilities: { pUp: 0.5 },
      regime: { label: "neutral" },
      featureImportances: []
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/snapshot?symbol=BTC/USDT&timeframe=1h" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ai.probabilities.pUp).toBe(0.5);
    expect(body.ai.asOf).toBe(new Date("2024-01-01T02:00:00Z").getTime());
  });
});
