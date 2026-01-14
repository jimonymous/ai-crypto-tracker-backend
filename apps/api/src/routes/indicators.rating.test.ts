import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import indicatorRatingRoutes from "./indicators.rating";

const prismaMock = vi.hoisted(() => ({
  market: { findFirst: vi.fn() },
  candle: { findMany: vi.fn() },
  indicatorSnapshot: { findFirst: vi.fn() }
}));

vi.mock("../db", () => ({ prisma: prismaMock }));

describe("indicator rating route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.market.findFirst.mockResolvedValue({ id: "m1", symbol: "BTC/USDT", timeframe: "1h" });
    prismaMock.candle.findMany.mockResolvedValue([
      { timestamp: new Date("2024-01-01T00:00:00Z"), close: 100 },
      { timestamp: new Date("2024-01-01T01:00:00Z"), close: 105 }
    ]);
    prismaMock.indicatorSnapshot.findFirst.mockResolvedValue({
      data: {
        latest: {
          ema20: 100,
          ema50: 98,
          ema200: 90,
          rsi14: 65,
          macd: { macd: 1, signal: 0.5, histogram: 0.5 },
          bollinger: { upper: 110, lower: 90, basis: 100, bandwidth: 0.2 },
          vwap: 99
        }
      }
    });
  });

  const buildApp = async () => {
    const app = Fastify();
    await app.register(indicatorRatingRoutes);
    await app.ready();
    return app;
  };

  it("returns rating for a market", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/indicators/rating?symbol=BTC/USDT&timeframe=1h" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rating.rating).toBeGreaterThan(50);
    expect(body.rating.components.emaStack).toBeGreaterThan(0);
    expect(body.symbol).toBe("BTC/USDT");
  });

  it("respects disabled indicators", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/indicators/rating?symbol=BTC/USDT&timeframe=1h&disabled=emaStack,macd"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rating.components.emaStack).toBe(0);
    expect(body.rating.components.macd).toBe(0);
  });

  it("handles bearish snapshot and weight overrides", async () => {
    prismaMock.indicatorSnapshot.findFirst.mockResolvedValue({
      data: {
        latest: {
          ema20: 90,
          ema50: 95,
          ema200: 100,
          rsi14: 30,
          macd: { macd: -1, signal: -0.5, histogram: -0.5 },
          bollinger: { upper: 110, lower: 90, basis: 100, bandwidth: 0.2 },
          vwap: 102
        }
      }
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: '/indicators/rating?symbol=BTC/USDT&timeframe=1h&weights={"rsi":2,"macd":2}'
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rating.rating).toBeLessThan(50);
  });

  it("ignores malformed weights", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/indicators/rating?symbol=BTC/USDT&timeframe=1h&weights=not-json"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rating).toBeDefined();
  });
});
