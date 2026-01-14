import { describe, expect, it, vi, beforeEach } from "vitest";
import { getIngestionTargets, ingestMarketCandles, timeframeToMs } from "./ingest";

const prismaMock = vi.hoisted(() => ({
  market: { findMany: vi.fn() },
  candle: { findFirst: vi.fn(), createMany: vi.fn() }
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("./ccxt", () => ({
  fetchOHLCVWithRateLimit: (...args: unknown[]) => fetchMock(...args)
}));

describe("ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns timeframe ms", () => {
    expect(timeframeToMs("1h")).toBe(3_600_000);
    expect(timeframeToMs("unknown")).toBe(300_000);
  });

  it("getIngestionTargets maps markets", async () => {
    prismaMock.market.findMany.mockResolvedValue([{ id: "m1", symbol: "BTC/USDT", exchange: "binance", timeframe: "1h" }]);
    const targets = await getIngestionTargets();
    expect(targets[0]).toMatchObject({ marketId: "m1", symbol: "BTC/USDT", exchange: "binance", timeframe: "1h" });
  });

  it("ingests candles and skips missing", async () => {
    prismaMock.candle.findFirst.mockResolvedValue(null);
    fetchMock.mockResolvedValue([
      [1700000000000, 1, 2, 0.5, 1.5, 10],
      [null, 1, 2, 0.5, 1.5, 10] // will be filtered
    ]);
    prismaMock.candle.createMany.mockResolvedValue({ count: 1 });
    const res = await ingestMarketCandles({
      marketId: "m1",
      symbol: "BTC/USDT",
      exchange: "binance",
      timeframe: "1h"
    });
    expect(res.inserted).toBe(1);
    expect(fetchMock).toHaveBeenCalled();
  });
});
