import { Job, Processor } from "bullmq";
import { publishRewardsEpoch } from "../../rewards/publish";
import { currentEpochId } from "../../rewards/accrue";

export type PublishRewardsJobData = {
  epochId?: string;
};

export const publishRewardsProcessor: Processor<PublishRewardsJobData> = async (
  job: Job<PublishRewardsJobData>
) => {
  const epochId = job.data.epochId ?? currentEpochId();
  job.log(`Publishing rewards root for epoch ${epochId}`);

  const result = await publishRewardsEpoch(epochId);

  job.log(`Published rewards root for epoch ${epochId} tx=${result.txHash}`);
  return result;
};
