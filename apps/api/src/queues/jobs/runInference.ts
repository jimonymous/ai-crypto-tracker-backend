import { Job, Processor } from "bullmq";
import { prisma } from "../../db";
import { redis } from "../../redis";
import { callInference } from "../../ai/client";
import { IndicatorSeries } from "../../types/shared";
import fs from "node:fs";
import path from "node:path";

const PREDICTION_TTL_SECONDS = 300;
const artifactsRoot = path.resolve(process.cwd(), "../ai/artifacts");
const safeSymbol = (symbol: string) => symbol.replace(/\//g, "-");
const hasTrainedModelArtifacts = (symbol: string, timeframe: string) => {
  const up = path.join(artifactsRoot, `v1_${safeSymbol(symbol)}_${timeframe}_p_up.pkl`);
  const vol = path.join(artifactsRoot, `v1_${safeSymbol(symbol)}_${timeframe}_p_high_vol.pkl`);
  return fs.existsSync(up) && fs.existsSync(vol);
};

export type RunInferenceJobData = {
  marketId: string;
  symbol: string;
  timeframe: string;
  horizonMinutes: number;
};

const toNumber = (val: any) => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  return Number(val);
};

export const runInferenceProcessor: Processor<RunInferenceJobData> = async (job: Job<RunInferenceJobData>) => {
  const { marketId, symbol, timeframe, horizonMinutes } = job.data;
  job.log(`Running inference for market=${marketId} ${symbol} ${timeframe}`);

  if (!hasTrainedModelArtifacts(symbol, timeframe)) {
    job.log(`Skipping inference: no trained artifacts for ${symbol} ${timeframe}`);
    return { skipped: true, reason: "no trained artifacts" };
  }

  const candles = await prisma.candle.findMany({
    where: { marketId, timeframe },
    orderBy: { timestamp: "desc" },
    take: 600
  });

  if (!candles.length) {
    throw new Error("No candles available for inference");
  }

  const indicatorSnapshot = await prisma.indicatorSnapshot.findFirst({
    where: { marketId, timeframe },
    orderBy: { asOf: "desc" }
  });

  const serializedCandles = candles
    .map((c) => ({
      timestamp: Number(c.timestamp),
      open: toNumber(c.open),
      high: toNumber(c.high),
      low: toNumber(c.low),
      close: toNumber(c.close),
      volume: toNumber(c.volume)
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const rawSeries = (indicatorSnapshot?.data as any)?.series;
  const indicators = Array.isArray(rawSeries) ? (rawSeries as IndicatorSeries[]) : [];

  const request = {
    symbol,
    timeframe,
    horizonMinutes,
    asOf: serializedCandles[serializedCandles.length - 1].timestamp,
    candles: serializedCandles,
    indicators
  };

  let response;
  try {
    response = await callInference(request);
  } catch (err: any) {
    const message = err?.message || String(err);
    // Gracefully skip when models are not yet trained instead of failing the worker
    job.log(`inference skipped for ${marketId}/${timeframe}: ${message}`);
    return { skipped: true, reason: message };
  }

  await prisma.modelPrediction.create({
    data: {
      marketId,
      timeframe,
      horizonMinutes,
      asOf: BigInt(response.asOf),
      probabilities: response.probabilities,
      regime: response.regime ?? undefined,
      featureImportances: response.featureImportances ?? undefined,
      requestId: response.requestId ?? null
    }
  });

  const cacheKey = `prediction:latest:${marketId}:${timeframe}`;
  await redis.set(cacheKey, JSON.stringify(response), "EX", PREDICTION_TTL_SECONDS);

  job.log(
    `Stored prediction for market=${marketId} ${symbol} ${timeframe} pUp=${response.probabilities?.pUp}`
  );

  return response;
};
