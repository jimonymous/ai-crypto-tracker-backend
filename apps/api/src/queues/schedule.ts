import {
  candleIngestionQueue,
  indicatorCalcQueue,
  aiInferenceQueue,
  rewardsAccrualQueue,
  onchainAnchoringQueue,
  alertsEvalQueue,
  dexCandleIngestionQueue
} from "./index";
import { getIngestionTargets, getDexMarketTargets, timeframeToMs } from "../market/ingest";
import { config } from "../config";
import { getDexChains } from "../dex/config";
import { prisma } from "../db";
import fs from "node:fs";
import path from "node:path";

const MIN_REPEAT_MS = 60_000;
const rewardsRepeatMs = Math.max(config.REWARD_EPOCH_MINUTES * 60 * 1000, MIN_REPEAT_MS);

const artifactsRoot = path.resolve(process.cwd(), "../ai/artifacts");
const safeSymbol = (symbol: string) => symbol.replace(/\//g, "-");
const hasTrainedModelArtifacts = (symbol: string, timeframe: string) => {
  const up = path.join(artifactsRoot, `v1_${safeSymbol(symbol)}_${timeframe}_p_up.pkl`);
  const vol = path.join(artifactsRoot, `v1_${safeSymbol(symbol)}_${timeframe}_p_high_vol.pkl`);
  return fs.existsSync(up) && fs.existsSync(vol);
};

const hasMinCandles = async (marketId: string, timeframe: string, minSamples: number) => {
  const count = await prisma.candle.count({ where: { marketId, timeframe } });
  return count >= minSamples;
};
const SKIP_AI_GATING = process.env.NODE_ENV === "test";

export const startIngestionScheduler = async () => {
  const repeatKeys: { queue: any; key: string }[] = [];
  const targets = await getIngestionTargets();

  for (const target of targets) {
    const every = Math.max(Math.floor(timeframeToMs(target.timeframe) * 0.9), MIN_REPEAT_MS);

    const ingestJob = await candleIngestionQueue.add(`ingest:${target.marketId}:${target.timeframe}`, target, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 50,
      removeOnFail: 200,
      jobId: `ingest:${target.marketId}:${target.timeframe}`,
      repeat: {
        every
      }
    });
    if (ingestJob?.repeatJobKey) repeatKeys.push({ queue: candleIngestionQueue, key: ingestJob.repeatJobKey });

    const canRunAi =
      SKIP_AI_GATING ||
      (hasTrainedModelArtifacts(target.symbol, target.timeframe) &&
        (await hasMinCandles(target.marketId, target.timeframe, 1)));
    if (canRunAi) {
      const aiJob = await aiInferenceQueue.add(
        `ai:${target.marketId}:${target.timeframe}`,
        {
          marketId: target.marketId,
          symbol: target.symbol,
          timeframe: target.timeframe,
          horizonMinutes: 60
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 4000 },
          removeOnComplete: 50,
          removeOnFail: 200,
          jobId: `ai:${target.marketId}:${target.timeframe}`,
          repeat: {
            every
          }
        }
      );
      if (aiJob?.repeatJobKey) repeatKeys.push({ queue: aiInferenceQueue, key: aiJob.repeatJobKey });
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[scheduler] skipping ai inference for ${target.symbol} ${target.timeframe} (no trained artifacts or insufficient candles)`
      );
    }

    const indicatorsJob = await indicatorCalcQueue.add(`indicators:${target.marketId}:${target.timeframe}`, {
      marketId: target.marketId,
      timeframe: target.timeframe
    }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 50,
      removeOnFail: 200,
      jobId: `indicators:${target.marketId}:${target.timeframe}`,
      repeat: {
        every
      }
    });
    if (indicatorsJob?.repeatJobKey) repeatKeys.push({ queue: indicatorCalcQueue, key: indicatorsJob.repeatJobKey });
  }

  // eslint-disable-next-line no-console
  console.log(
    `[scheduler] scheduled ${targets.length} candle ingestion jobs (prefix=${config.QUEUE_PREFIX})`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[scheduler] scheduled ${targets.length} indicator calculation jobs (prefix=${config.QUEUE_PREFIX})`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[scheduler] scheduled ${targets.length} ai inference jobs (prefix=${config.QUEUE_PREFIX})`
  );
  // Dex markets: schedule on-chain candle ingestion, indicators/alerts, and ai if artifacts exist
  const dexChains = getDexChains();
  const intervalSeconds = 60; // 1m spot sampling
  const timeframe = intervalSeconds % 60 === 0 ? `${intervalSeconds / 60}m` : `${intervalSeconds}s`;
  const every = 60_000; // strict 1m cadence
  const jobsPerMinute = 60; // cap scheduling to 60 jobs per minute (1 per second)
  const stagger = 1_000; // 1 second spacing
  const perJobRateLimit = 1; // at most 1 req/sec per job

  const allPools: { chainId: number; address: string }[] = [];
  for (const chain of dexChains) {
    for (const pool of chain.pools) {
      allPools.push({ chainId: chain.chainId, address: pool.address });
    }
  }

  // prune repeatable jobs for pools no longer allowlisted
  try {
    const repeatables = await dexCandleIngestionQueue.getRepeatableJobs();
    const allowlistedKeys = new Set(allPools.map((p) => `dex:${p.chainId}:${p.address}:${intervalSeconds}`));
    for (const job of repeatables) {
      const id = job.id ?? "";
      if (!allowlistedKeys.has(id)) {
        await dexCandleIngestionQueue.removeRepeatableByKey(job.key);
        // eslint-disable-next-line no-console
        console.log(`[scheduler] removed stale dex repeatable job ${id}`);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[scheduler] failed to prune stale dex jobs", err);
  }

  const cappedPools = allPools.slice(0, jobsPerMinute);
  const skippedCount = allPools.length - cappedPools.length;

  cappedPools.forEach(async (pool, idx) => {
    const jobId = `dex:${pool.chainId}:${pool.address}:${intervalSeconds}`;
    const minuteOffset = Math.floor(idx / jobsPerMinute);
    const slotWithinMinute = idx % jobsPerMinute;
    const startDate = new Date(Date.now() + minuteOffset * every + slotWithinMinute * stagger);
    const dexJob = await dexCandleIngestionQueue.add(
      jobId,
      {
        chainId: pool.chainId,
        poolAddress: pool.address,
        windowMinutes: 1, // only look back 1m; repeated every minute
        intervalSeconds,
        maxBlocks: 20000,
        minSamples: 1,
        rateLimitPerSec: perJobRateLimit
      },
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 }, // soften retries to avoid 429s
        removeOnComplete: 50,
        removeOnFail: 200,
        jobId,
        repeat: { every, startDate }
      }
    );
    if (dexJob?.repeatJobKey) repeatKeys.push({ queue: dexCandleIngestionQueue, key: dexJob.repeatJobKey });
  });

  if (skippedCount > 0) {
    // eslint-disable-next-line no-console
    console.log(`[scheduler] dex ingestion capped at ${jobsPerMinute} pools; skipped ${skippedCount} pools this cycle`);
  }
  // Dex markets (DB rows created during dex ingestion): skip ccxt ingestion, but schedule indicators/alerts/ai if candles already exist
  const dexTargets = await getDexMarketTargets();
  for (const target of dexTargets) {
    const every = Math.max(Math.floor(timeframeToMs(target.timeframe) * 0.9), MIN_REPEAT_MS);
    const indicatorsJob = await indicatorCalcQueue.add(`indicators:${target.marketId}:${target.timeframe}`, {
      marketId: target.marketId,
      timeframe: target.timeframe
    }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 50,
      removeOnFail: 200,
      jobId: `indicators:${target.marketId}:${target.timeframe}`,
      repeat: {
        every
      }
    });
    if (indicatorsJob?.repeatJobKey) repeatKeys.push({ queue: indicatorCalcQueue, key: indicatorsJob.repeatJobKey });

    const canRunAi =
      SKIP_AI_GATING ||
      (hasTrainedModelArtifacts(target.symbol, target.timeframe) &&
        (await hasMinCandles(target.marketId, target.timeframe, 1)));
    if (canRunAi) {
      const aiJob = await aiInferenceQueue.add(
        `ai:${target.marketId}:${target.timeframe}`,
        {
          marketId: target.marketId,
          symbol: target.symbol,
          timeframe: target.timeframe,
          horizonMinutes: 60
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 4000 },
          removeOnComplete: 50,
          removeOnFail: 200,
          jobId: `ai:${target.marketId}:${target.timeframe}`,
          repeat: {
            every
          }
        }
      );
      if (aiJob?.repeatJobKey) repeatKeys.push({ queue: aiInferenceQueue, key: aiJob.repeatJobKey });
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[scheduler] skipping ai inference for dex market ${target.symbol} ${target.timeframe} (no trained artifacts or insufficient candles)`
      );
    }

    const alertsJob = await alertsEvalQueue.add(
      `alerts:${target.marketId}:${target.timeframe}`,
      { marketId: target.marketId, timeframe: target.timeframe },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: 50,
        removeOnFail: 200,
        jobId: `alerts:${target.marketId}:${target.timeframe}`,
        repeat: { every }
      }
    );
    if (alertsJob?.repeatJobKey) repeatKeys.push({ queue: alertsEvalQueue, key: alertsJob.repeatJobKey });
  }

  const accrueJob = await rewardsAccrualQueue.add(
    `rewards:accrue`,
    { epochId: undefined },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 20,
      removeOnFail: 50,
      jobId: `rewards:accrue`,
      repeat: { every: rewardsRepeatMs }
    }
  );
  if (accrueJob?.repeatJobKey) repeatKeys.push({ queue: rewardsAccrualQueue, key: accrueJob.repeatJobKey });
  // eslint-disable-next-line no-console
  console.log(`[scheduler] scheduled rewards accrual every ${rewardsRepeatMs / 1000}s`);

  if (process.env.CHAIN_PRIVATE_KEY) {
    const publishJob = await onchainAnchoringQueue.add(
      `rewards:publish`,
      { epochId: undefined },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 7000 },
        removeOnComplete: 20,
        removeOnFail: 50,
        jobId: `rewards:publish`,
        repeat: { every: rewardsRepeatMs }
      }
    );
    if (publishJob?.repeatJobKey) repeatKeys.push({ queue: onchainAnchoringQueue, key: publishJob.repeatJobKey });
    // eslint-disable-next-line no-console
    console.log(`[scheduler] scheduled rewards publish every ${rewardsRepeatMs / 1000}s`);
  } else {
    // eslint-disable-next-line no-console
    console.log("[scheduler] CHAIN_PRIVATE_KEY not set; skipping rewards publish scheduling");
  }

  for (const target of targets) {
    const every = Math.max(Math.floor(timeframeToMs(target.timeframe) * 0.9), MIN_REPEAT_MS);
    const alertsJob = await alertsEvalQueue.add(
      `alerts:${target.marketId}:${target.timeframe}`,
      { marketId: target.marketId, timeframe: target.timeframe },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: 50,
        removeOnFail: 200,
        jobId: `alerts:${target.marketId}:${target.timeframe}`,
        repeat: { every }
      }
    );
    if (alertsJob?.repeatJobKey) repeatKeys.push({ queue: alertsEvalQueue, key: alertsJob.repeatJobKey });
  }

  return {
    stop: async () => {
      for (const { queue, key } of repeatKeys) {
        try {
          await queue.removeRepeatableByKey(key);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[scheduler] failed to remove repeatable job", key, err);
        }
      }
    }
  };
};
