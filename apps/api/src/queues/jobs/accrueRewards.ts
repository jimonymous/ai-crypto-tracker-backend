import { Job, Processor } from "bullmq";
import { accrueRewardsForEpoch } from "../../rewards/accrue";

export type AccrueRewardsJobData = {
  epochId?: string;
};

export const accrueRewardsProcessor: Processor<AccrueRewardsJobData> = async (job: Job<AccrueRewardsJobData>) => {
  const cycle = job.data.epochId;
  job.log(`Accruing rewards for epoch ${cycle ?? "current"}`);

  const result = await accrueRewardsForEpoch(cycle);

  job.log(`Accrual complete for epoch=${result.cycle} created=${result.created}`);
  return result;
};
