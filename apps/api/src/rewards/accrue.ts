import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../db";
import { config } from "../config";

const epochDurationMs = config.REWARD_EPOCH_MINUTES * 60 * 1000;

export const currentEpochId = (now: number = Date.now()): string =>
  Math.floor(now / epochDurationMs).toString();

const calcScore = async (userId: string) => {
  const [watchlists, alerts, holdings, predictions] = await Promise.all([
    prisma.watchlist.count({ where: { userId } }),
    prisma.alert.count({ where: { userId } }),
    prisma.portfolioHolding.count({ where: { userId } }),
    prisma.modelPrediction.count({ where: { market: { watchlistEntries: { some: { watchlist: { userId } } } } } })
  ]);

  const base = 10;
  const score = base + watchlists * 2 + alerts * 3 + holdings * 4 + predictions;
  return score;
};

export const accrueRewardsForEpoch = async (epochId?: string) => {
  const cycle = epochId ?? currentEpochId();
  const users = await prisma.user.findMany({
    where: { walletAddress: { not: null } },
    select: { id: true, walletAddress: true }
  });

  const claimableAt = new Date();
  const expiresAt = new Date(claimableAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  let created = 0;

  for (const user of users) {
    const existing = await prisma.rewardAccrual.findFirst({
      where: { userId: user.id, cycle }
    });
    if (existing) continue;

    const score = await calcScore(user.id);
    if (score <= 0) continue;

    const amount = new Decimal(score);

    await prisma.rewardAccrual.create({
      data: {
        userId: user.id,
        cycle,
        token: process.env.REWARD_TOKEN_SYMBOL || "CTT",
        amount,
        claimableAt,
        expiresAt,
        status: "pending",
        merkleProof: []
      }
    });
    created += 1;
  }

  return { cycle, created, totalUsers: users.length };
};
