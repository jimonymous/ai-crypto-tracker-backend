import { FastifyInstance } from "fastify";
import { computeVolatility, computeVaR, computePnLTimeline, checkLiquidationRisk } from "../risk/metrics";

export default async function riskRoutes(app: FastifyInstance) {
  app.post("/risk/metrics", async (request, reply) => {
    const body = request.body as { prices?: number[]; returns?: number[]; percentile?: number };
    const prices = body.prices ?? [];
    const returns = body.returns ?? [];
    const vol = computeVolatility(prices);
    const var95 = computeVaR(returns.length ? returns : pricesToReturns(prices), body.percentile ?? 0.95);
    return reply.send({ volatility: vol, var: var95 });
  });

  app.post("/risk/alerts", async (request, reply) => {
    const body = request.body as { prices?: number[]; liquidationThresholdPct?: number };
    const trigger = checkLiquidationRisk(body.prices ?? [], body.liquidationThresholdPct ?? 0.3);
    return reply.send({ triggered: trigger });
  });

  app.post("/risk/pnl", async (request, reply) => {
    const body = request.body as { points: { timestamp: number; pnl: number }[] };
    const timeline = computePnLTimeline(body.points ?? []);
    return reply.send({ timeline });
  });
}

const pricesToReturns = (prices: number[]) => {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  return returns;
};
