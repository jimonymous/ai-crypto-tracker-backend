import { Queue } from "bullmq";
import Redis from "ioredis";
import { config } from "../config";

export const QUEUE_NAMES = {
  candleIngestion: "candle-ingestion",
  indicatorCalc: "indicator-calc",
  aiInference: "ai-inference",
  rewardsAccrual: "rewards-accrual",
  onchainAnchoring: "onchain-anchoring",
  alertsEval: "alerts-eval",
  dexCandleIngestion: "dex-candle-ingestion"
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const createQueue = (name: string) =>
  new Queue(name, {
    connection: new Redis(config.REDIS_URL, { maxRetriesPerRequest: null }),
    prefix: config.QUEUE_PREFIX
  });

export const candleIngestionQueue = createQueue(QUEUE_NAMES.candleIngestion);
export const indicatorCalcQueue = createQueue(QUEUE_NAMES.indicatorCalc);
export const aiInferenceQueue = createQueue(QUEUE_NAMES.aiInference);
export const rewardsAccrualQueue = createQueue(QUEUE_NAMES.rewardsAccrual);
export const onchainAnchoringQueue = createQueue(QUEUE_NAMES.onchainAnchoring);
export const alertsEvalQueue = createQueue(QUEUE_NAMES.alertsEval);
export const dexCandleIngestionQueue = createQueue(QUEUE_NAMES.dexCandleIngestion);

export const queues = {
  candleIngestionQueue,
  indicatorCalcQueue,
  aiInferenceQueue,
  rewardsAccrualQueue,
  onchainAnchoringQueue,
  alertsEvalQueue,
  dexCandleIngestionQueue
};

export const closeQueues = async () => {
  await Promise.all(Object.values(queues).map((queue) => queue.close()));
};
