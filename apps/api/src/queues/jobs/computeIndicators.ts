import { Job, Processor } from "bullmq";
import { computeAndStoreIndicators } from "../../ta/store";

export type ComputeIndicatorsJobData = {
  marketId: string;
  timeframe: string;
};

export type ComputeIndicatorsJob = Job<ComputeIndicatorsJobData>;

export const computeIndicatorsProcessor: Processor<ComputeIndicatorsJobData> = async (job: ComputeIndicatorsJob) => {
  const { marketId, timeframe } = job.data;
  job.log(`Computing indicators for market=${marketId} timeframe=${timeframe}`);

  const result = await computeAndStoreIndicators({ marketId, timeframe });

  job.log(`Computed indicators for market=${marketId} timeframe=${timeframe} asOf=${result.asOf}`);
  return result;
};
