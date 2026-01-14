import { Processor, QueueEvents, Worker } from "bullmq";
import Redis from "ioredis";
import { config } from "../config";
import { ingestCandlesProcessor } from "./jobs/ingestCandles";
import { computeIndicatorsProcessor } from "./jobs/computeIndicators";
import { runInferenceProcessor } from "./jobs/runInference";
import { accrueRewardsProcessor } from "./jobs/accrueRewards";
import { publishRewardsProcessor } from "./jobs/publishRewards";
import { evaluateAlertsProcessor } from "./jobs/evaluateAlerts";
import { ingestDexCandlesProcessor } from "./jobs/ingestDexCandles";
import { QUEUE_NAMES, QueueName } from "./index";

type WorkerBundle = {
  worker: Worker;
  events: QueueEvents;
};

const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null
});

const options = {
  connection,
  prefix: config.QUEUE_PREFIX
};

const logProcessor =
  (label: string): Processor =>
  async (job) => {
    job.log(`Processing ${label} job`);
    return { ok: true, jobId: job.id, label, data: job.data };
  };

const createWorker = (queueName: QueueName, processor: Processor, concurrency = 2): WorkerBundle => {
  const worker = new Worker(queueName, processor, { ...options, concurrency });
  const events = new QueueEvents(queueName, options);

  worker.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker:${queueName}] error`, err);
  });

  events.on("failed", ({ jobId, failedReason }) => {
    // eslint-disable-next-line no-console
    console.error(`[worker:${queueName}] job ${jobId} failed`, failedReason);
  });

  events.on("completed", ({ jobId }) => {
    // eslint-disable-next-line no-console
    console.log(`[worker:${queueName}] job ${jobId} completed`);
  });

  return { worker, events };
};

export const startWorkers = () => {
  const bundles: WorkerBundle[] = [
    createWorker(QUEUE_NAMES.candleIngestion, ingestCandlesProcessor, 5),
    createWorker(QUEUE_NAMES.indicatorCalc, computeIndicatorsProcessor, 5),
    createWorker(QUEUE_NAMES.aiInference, runInferenceProcessor, 5),
    createWorker(QUEUE_NAMES.rewardsAccrual, accrueRewardsProcessor, 1),
    createWorker(QUEUE_NAMES.onchainAnchoring, publishRewardsProcessor, 1),
    createWorker(QUEUE_NAMES.alertsEval, evaluateAlertsProcessor, 5),
    // Moderate concurrency to avoid RPC throttling; jobs remain staggered 1s apart
    createWorker(QUEUE_NAMES.dexCandleIngestion, ingestDexCandlesProcessor, 5)
  ];

  return {
    close: async () => {
      await Promise.all(bundles.flatMap(({ worker, events }) => [worker.close(), events.close()]));
      await connection.quit();
    }
  };
};
