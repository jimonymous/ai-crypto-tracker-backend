import { prisma } from "../db";
import { redis } from "../redis";
import { computeIndicators, CandleInput } from "./indicators";

const REDIS_TTL_SECONDS = 300;

type IndicatorPayload = ReturnType<typeof computeIndicators>;

const normalizeCandles = (candles: any[]): CandleInput[] =>
  candles
    .map((c) => ({
      timestamp: Number(c.timestamp),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume)
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

const latestNonNull = <T>(series: { value: T | null }[]): T | null => {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].value != null) return series[i].value;
  }
  return null;
};

const redisKeyLatest = (marketId: string, timeframe: string) =>
  `indicators:latest:${marketId}:${timeframe}`;

export const computeAndStoreIndicators = async (params: {
  marketId: string;
  timeframe: string;
  limit?: number;
}) => {
  const { marketId, timeframe, limit = 600 } = params;

  const candlesDesc = await prisma.candle.findMany({
    where: { marketId, timeframe },
    orderBy: { timestamp: "desc" },
    take: limit
  });

  if (!candlesDesc.length) {
    return { marketId, timeframe, asOf: null, inserted: 0 };
  }

  const candles = normalizeCandles(candlesDesc);
  const indicatorSeries: IndicatorPayload = computeIndicators(candles);

  const asOf = candles[candles.length - 1].timestamp;

  const latestSnapshot = {
    ema20: latestNonNull(indicatorSeries.ema20),
    ema50: latestNonNull(indicatorSeries.ema50),
    ema200: latestNonNull(indicatorSeries.ema200),
    rsi14: latestNonNull(indicatorSeries.rsi14),
    macd: latestNonNull(indicatorSeries.macd),
    bollinger: latestNonNull(indicatorSeries.bollinger),
    atr14: latestNonNull(indicatorSeries.atr14),
    vwap: latestNonNull(indicatorSeries.vwap)
  };

  const payload = {
    asOf,
    timeframe,
    latest: latestSnapshot,
    series: indicatorSeries
  };

  await prisma.indicatorSnapshot.upsert({
    where: {
      marketId_timeframe_asOf: {
        marketId,
        timeframe,
        asOf: BigInt(asOf)
      }
    },
    update: {
      data: payload,
      source: "ta",
      version: "v1"
    },
    create: {
      marketId,
      timeframe,
      asOf: BigInt(asOf),
      data: payload,
      source: "ta",
      version: "v1"
    }
  });

  await redis.set(redisKeyLatest(marketId, timeframe), JSON.stringify(payload.latest), "EX", REDIS_TTL_SECONDS);

  return { marketId, timeframe, asOf, inserted: 1 };
};
