import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { beforeEach, describe, expect, it, vi } from "vitest";
import wsRoutes from "./ws";

const prismaMock = vi.hoisted(() => ({
  market: { findFirst: vi.fn() },
  candle: { findMany: vi.fn() },
  indicatorSnapshot: { findFirst: vi.fn() },
  modelPrediction: { findFirst: vi.fn() }
}));

const redisGetMock = vi.hoisted(() => vi.fn());
const redisSubMock = vi.hoisted(() => ({
  connect: vi.fn(),
  subscribe: vi.fn(),
  on: vi.fn(),
  disconnect: vi.fn()
}));

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../redis", () => ({
  redis: {
    get: (...args: unknown[]) => redisGetMock(...args),
    duplicate: () => redisSubMock
  }
}));

describe("wsRoutes /ws/updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.market.findFirst.mockResolvedValue({ id: "m1", symbol: "BTC/USDT", timeframe: "1h" });
    prismaMock.candle.findMany.mockResolvedValue([
      { timestamp: BigInt(Date.now()), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }
    ]);
    prismaMock.indicatorSnapshot.findFirst.mockResolvedValue({ data: { latest: { ema20: 1 } } });
    prismaMock.modelPrediction.findFirst.mockResolvedValue(null);
    redisGetMock.mockResolvedValue(null);
  });

  it("registers websocket route", async () => {
    const app = Fastify();
    await app.register(websocket);
    await app.register(wsRoutes);
    await app.ready();
    const routes = app.printRoutes();
    expect(routes.includes("ws/updates")).toBe(true);
  });
});
