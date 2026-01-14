import { Processor } from "bullmq";
import { prisma } from "../../db";
import { findToken, getDexChain } from "../../dex/config";
import { buildCandlesForPair } from "../../dex/candleBuilder";
import { intervalSecondsToTimeframe, isAllowedDexInterval, allowedDexIntervalsSeconds } from "../../dex/timeframes";
import { timeframeToMs } from "../../market/ingest";
import { redis } from "../../redis";

export type DexCandleJobData = {
  chainId: number;
  poolAddress: string;
  windowMinutes: number;
  intervalSeconds: number;
  maxBlocks: number;
  minSamples: number;
  rateLimitPerSec?: number;
  creationBlock?: string | number | bigint;
};

export const runDexCandleIngest = async (data: DexCandleJobData) => {
  const { chainId, poolAddress, windowMinutes, intervalSeconds, maxBlocks, minSamples, rateLimitPerSec, creationBlock } =
    data;

  const chain = getDexChain(chainId);
  if (!chain) throw new Error(`unsupported chain ${chainId}`);
  const pool = chain.pools.find((p) => p.address.toLowerCase() === poolAddress.toLowerCase());
  if (!pool) throw new Error(`pool not allowlisted on chain ${chainId}`);

  const marketId = poolAddress.toLowerCase();
  if (!isAllowedDexInterval(intervalSeconds)) {
    throw new Error(
      `intervalSeconds ${intervalSeconds} not allowed; use one of ${allowedDexIntervalsSeconds.join(", ")}`
    );
  }
  const timeframe = intervalSecondsToTimeframe(intervalSeconds);
  const intervalMs = intervalSeconds * 1000;
  const rateKey = `dex:ingest:last:${marketId}:${timeframe}`;
  const lastRun = await redis.get(rateKey);
  if (lastRun && Date.now() - Number(lastRun) < intervalMs) {
    return { skipped: true, reason: "ingestion rate-limited to 1 per interval", poolAddress, chainId };
  }

  // guardrail: do not add new markets until existing dex markets have a 3-day 1m history
  const existingMarket = await prisma.market.findUnique({ where: { id: marketId } });
  if (!existingMarket) {
    const canAdd = await allDexMarketsHaveHistory();
    if (!canAdd) {
      return { skipped: true, reason: "existing dex markets still building history", poolAddress, chainId };
    }
  }

  // If we already have a fresh candle for this timeframe, skip to avoid over-inserting
  const latestCandle = await prisma.candle.findFirst({
    where: { marketId, timeframe },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true }
  });
  if (latestCandle?.timestamp) {
    const ageMs = Date.now() - Number(latestCandle.timestamp);
    // allow a small buffer to account for scheduling drift
    if (ageMs < intervalMs - 5_000) {
      return { skipped: true, reason: "recent candle exists", poolAddress, chainId };
    }
  }

  // ensure market exists so FK is satisfied
  const baseToken = findToken(chain, pool.token0);
  const quoteToken = findToken(chain, pool.token1);
  const baseSymbol = baseToken?.symbol ?? pool.token0;
  const quoteSymbol = quoteToken?.symbol ?? pool.token1;
  const symbol = `${baseSymbol}/${quoteSymbol}`;
  const exchange = `dex-${chainId}`;
  await prisma.$transaction(async (tx) => {
    const existingById = await tx.market.findUnique({ where: { id: marketId } });
    const existingBySymbol = await tx.market.findUnique({
      where: { symbol_exchange: { symbol, exchange } } as any
    });

    if (existingById) {
      await tx.market.update({
        where: { id: marketId },
        data: { symbol, baseAsset: baseSymbol, quoteAsset: quoteSymbol, exchange, timeframe }
      });
      return;
    }

    if (existingBySymbol) {
      // reuse the same record, just ensure id matches for FK; avoid duplicate symbol/exchange
      await tx.market.update({
        where: { id: existingBySymbol.id },
        data: { id: marketId, baseAsset: baseSymbol, quoteAsset: quoteSymbol, timeframe }
      });
      return;
    }

    await tx.market.create({
      data: { id: marketId, symbol, baseAsset: baseSymbol, quoteAsset: quoteSymbol, exchange, timeframe }
    });
  });

  const candlesResult = await buildCandlesForPair({
    chainId,
    poolAddress,
    sellToken: pool.token0,
    buyToken: pool.token1,
    windowMinutes,
    intervalSeconds,
    minSamples,
    maxBlocks,
    creationBlock: creationBlock !== undefined ? BigInt(creationBlock) : undefined,
    rateLimitPerSec
  });

  if (!candlesResult.candles.length) {
    return { inserted: 0, candleCount: 0, poolAddress };
  }

  const clampPrice = (v: number) => {
    if (!Number.isFinite(v)) return "0";
    const mag = Math.abs(v);
    if (mag > 1e15) return (Math.sign(v) * 1e15).toString();
    return v.toFixed(16);
  };

  const rows = candlesResult.candles.map((c) => ({
    marketId,
    timestamp: BigInt(c.startTs),
    open: clampPrice(c.open),
    high: clampPrice(c.high),
    low: clampPrice(c.low),
    close: clampPrice(c.close),
    volume: "0",
    timeframe,
    source: `onchain:${chainId}`
  }));

  const result = await prisma.candle.createMany({
    data: rows,
    skipDuplicates: true
  });

  // Retain a rolling 72h window for 1m candles
  if (timeframe === "1m") {
    const cutoff = BigInt(Date.now() - 72 * 60 * 60 * 1000);
    await prisma.candle.deleteMany({ where: { marketId, timeframe, timestamp: { lt: cutoff } } });
  }

  await rollupDerivedCandles(marketId);
  await redis.set(rateKey, Date.now().toString(), "PX", intervalMs);

  return { inserted: result.count, candleCount: candlesResult.candles.length, poolAddress, chainId };
};

export const ingestDexCandlesProcessor: Processor<DexCandleJobData> = async (job) => {
  return runDexCandleIngest(job.data);
};

const DERIVED_INTERVALS_SECONDS = [300, 900, 2700, 5400, 10800]; // 5m, 15m, 45m, 90m, 3h
const MIN_1M_HISTORY_CANDLES = 72 * 60; // 72h of 1m candles

const rollupDerivedCandles = async (marketId: string) => {
  const base = await prisma.candle.findMany({
    where: { marketId, timeframe: "1m" },
    orderBy: { timestamp: "asc" }
  });
  if (!base.length) return;
  for (const secs of DERIVED_INTERVALS_SECONDS) {
    const tf = secs % 60 === 0 ? `${secs / 60}m` : `${secs}s`;
    const tfMs = timeframeToMs(tf);
    const existing = await prisma.candle.findMany({
      where: { marketId, timeframe: tf },
      select: { timestamp: true }
    });
    const existingTs = new Set(existing.map((c) => c.timestamp.toString()));
    const buckets: Record<string, { ts: bigint; open: number; high: number; low: number; close: number }> = {};
    for (const c of base) {
      const tsNum = Number(c.timestamp);
      const bucketStart = Math.floor(tsNum / tfMs) * tfMs;
      const key = String(bucketStart);
      const price = Number(c.close);
      if (!Number.isFinite(price)) continue;
      if (!buckets[key]) {
        buckets[key] = {
          ts: BigInt(bucketStart),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close)
        };
      } else {
        const b = buckets[key];
        b.high = Math.max(b.high, Number(c.high));
        b.low = Math.min(b.low, Number(c.low));
        b.close = Number(c.close);
      }
    }
    const rows = Object.values(buckets).map((b) => ({
      marketId,
      timestamp: b.ts,
      open: b.open.toString(),
      high: b.high.toString(),
      low: b.low.toString(),
      close: b.close.toString(),
      volume: "0",
      timeframe: tf,
      source: "onchain-rollup"
    }));
    const rowsToInsert = rows.filter((r) => !existingTs.has(r.timestamp.toString()));
    if (!rowsToInsert.length) continue;
    await prisma.candle.createMany({ data: rowsToInsert, skipDuplicates: true });
  }
};

const allDexMarketsHaveHistory = async () => {
  const markets = await prisma.market.findMany({
    where: { exchange: { startsWith: "dex-" } },
    select: { id: true }
  });
  if (!markets.length) return true;
  const ids = markets.map((m) => m.id);
  const counts = await prisma.candle.groupBy({
    by: ["marketId"],
    where: { marketId: { in: ids }, timeframe: "1m" },
    _count: { _all: true }
  });
  const countMap = new Map(counts.map((c) => [c.marketId, c._count._all]));
  return ids.every((id) => (countMap.get(id) ?? 0) >= MIN_1M_HISTORY_CANDLES);
};
