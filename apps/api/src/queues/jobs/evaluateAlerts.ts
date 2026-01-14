import { Job, Processor } from "bullmq";
import { prisma } from "../../db";
import { redis } from "../../redis";

const toNumber = (val: any) => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  return Number(val);
};

export type EvaluateAlertsJobData = {
  marketId: string;
  timeframe: string;
};

export const evaluateAlertsProcessor: Processor<EvaluateAlertsJobData> = async (job: Job<EvaluateAlertsJobData>) => {
  const { marketId, timeframe } = job.data;
  const alerts = await prisma.alert.findMany({
    where: { marketId, status: "active" }
  });
  if (!alerts.length) return { evaluated: 0, triggered: 0 };

  const candle = await prisma.candle.findFirst({
    where: { marketId, timeframe },
    orderBy: { timestamp: "desc" }
  });
  if (!candle) return { evaluated: alerts.length, triggered: 0 };

  const price = toNumber(candle.close);
  let triggered = 0;

  for (const alert of alerts) {
    const threshold = (alert.condition as any)?.threshold;
    if (threshold == null) continue;
    const type = alert.type;
    const shouldTrigger =
      (type === "price_above" && price >= threshold) || (type === "price_below" && price <= threshold);
    if (shouldTrigger) {
      triggered += 1;
      await redis.publish(
        "alerts",
        JSON.stringify({
          userId: alert.userId,
          alertId: alert.id,
          marketId,
          price,
          threshold,
          type
        })
      );
      await prisma.alert.update({
        where: { id: alert.id },
        data: { status: "triggered" }
      });
    }
  }

  return { evaluated: alerts.length, triggered };
};
