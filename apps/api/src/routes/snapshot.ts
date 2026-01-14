import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { redis } from "../redis";
import { IndicatorSeries, Candle as SharedCandle } from "../types/shared";

const toNumber = (val: any) => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  return Number(val);
};

export default async function snapshotRoutes(app: FastifyInstance) {
  app.get("/snapshot", async (request, reply) => {
    const { symbol, timeframe = "1h" } = request.query as { symbol?: string; timeframe?: string };
    if (!symbol) {
      return reply.status(400).send({ message: "symbol is required" });
    }

    const market = await prisma.market.findFirst({
      where: { symbol, timeframe }
    });

    if (!market) {
      return reply.status(404).send({ message: "market not found" });
    }

    const candles = await prisma.candle.findMany({
      where: { marketId: market.id, timeframe },
      orderBy: { timestamp: "desc" },
      take: 500
    });

    const candlesSerialized: SharedCandle[] = candles
      .map((c) => ({
        timestamp: Number(c.timestamp),
        open: toNumber(c.open),
        high: toNumber(c.high),
        low: toNumber(c.low),
        close: toNumber(c.close),
        volume: toNumber(c.volume)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    const latestIndicator = await prisma.indicatorSnapshot.findFirst({
      where: { marketId: market.id, timeframe },
      orderBy: { asOf: "desc" }
    });

    const indicatorSeries: IndicatorSeries[] = (latestIndicator?.data as any)?.series ?? [];

    let aiPrediction: any = null;
    const predCacheKey = `prediction:latest:${market.id}:${timeframe}`;
    const cached = await redis.get(predCacheKey);
    if (cached) {
      aiPrediction = JSON.parse(cached);
    } else {
      const dbPrediction = await prisma.modelPrediction.findFirst({
        where: { marketId: market.id, timeframe },
        orderBy: { asOf: "desc" }
      });
      if (dbPrediction) {
        aiPrediction = {
          requestId: dbPrediction.requestId ?? undefined,
          symbol,
          timeframe,
          horizonMinutes: dbPrediction.horizonMinutes,
          asOf: Number(dbPrediction.asOf),
          probabilities: dbPrediction.probabilities as Record<string, number>,
          regime: dbPrediction.regime as any,
          featureImportances: dbPrediction.featureImportances as any
        };
      }
    }

    const response = {
      symbol,
      timeframe,
      asOf: candlesSerialized[candlesSerialized.length - 1]?.timestamp ?? Date.now(),
      candles: candlesSerialized,
      indicators: indicatorSeries,
      ai: aiPrediction
    };

    return reply.send(response);
  });
}
