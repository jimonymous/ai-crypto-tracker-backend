import { prisma } from "../db";
import { fetchOHLCVWithRateLimit } from "./ccxt";

export type MarketIngestionTarget = {
  marketId: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  limit?: number;
};

const timeframeMsLookup: Record<string, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000
};

export const timeframeToMs = (timeframe: string): number => {
  const known = timeframeMsLookup[timeframe];
  if (known) return known;
  const match = /^(\d+)([smhd])$/.exec(timeframe);
  if (match) {
    const value = Number(match[1]);
    const unit = match[2];
    const factor =
      unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : unit === "d" ? 86_400_000 : 0;
    if (factor) return value * factor;
  }
  return 300_000;
};

export const getIngestionTargets = async (): Promise<MarketIngestionTarget[]> => {
  const markets = await prisma.market.findMany({
    select: { id: true, symbol: true, exchange: true, timeframe: true }
  });

  return markets
    // skip on-chain dex markets; they are ingested elsewhere
    .filter((m) => !(m.exchange ?? "").toLowerCase().startsWith("dex-"))
    .map((m) => ({
      marketId: m.id,
      symbol: m.symbol,
      exchange: m.exchange ?? "binance",
      timeframe: m.timeframe ?? "1h"
    }));
};

export const getDexMarketTargets = async (): Promise<MarketIngestionTarget[]> => {
  const markets = await prisma.market.findMany({
    select: { id: true, symbol: true, exchange: true, timeframe: true },
    where: {
      exchange: { startsWith: "dex-" }
    }
  });

  return markets.map((m) => ({
    marketId: m.id,
    symbol: m.symbol,
    exchange: m.exchange ?? "dex",
    timeframe: m.timeframe ?? "60s"
  }));
};

export const ingestMarketCandles = async (target: MarketIngestionTarget) => {
  const { marketId, symbol, exchange, timeframe, limit = 500 } = target;

  const latest = await prisma.candle.findFirst({
    where: { marketId, timeframe },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true }
  });

  const bufferMs = timeframeToMs(timeframe);
  const since = latest ? Number(latest.timestamp - BigInt(bufferMs)) : undefined;

  const ohlcv = await fetchOHLCVWithRateLimit({
    exchangeId: exchange,
    symbol,
    timeframe,
    since,
    limit
  });

  if (!ohlcv.length) {
    return { inserted: 0, marketId };
  }

  const rows = ohlcv
    .filter((row) => row[0] != null)
    .map((row: any[]) => {
      const ts = row[0];
      if (ts == null) return null;
      return {
        marketId,
        timestamp: BigInt(ts),
        open: row[1]?.toString() ?? "0",
        high: row[2]?.toString() ?? "0",
        low: row[3]?.toString() ?? "0",
        close: row[4]?.toString() ?? "0",
        volume: row[5]?.toString() ?? "0",
        timeframe,
        source: exchange
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  if (!rows.length) {
    return { inserted: 0, marketId };
  }

  const result = await prisma.candle.createMany({
    data: rows,
    skipDuplicates: true
  });

  return { inserted: result.count, marketId, requested: rows.length, since };
};
