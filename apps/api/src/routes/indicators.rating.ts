import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { computeRating, IndicatorLatest } from "../ta/rating";

const toNumber = (val: any) => {
  if (val == null) return null;
  if (typeof val === "number") return val;
  return Number(val);
};

const parseList = (val?: string) =>
  val
    ?.split(",")
    .map((v) => v.trim())
    .filter(Boolean) ?? [];

export default async function indicatorRatingRoutes(app: FastifyInstance) {
  app.get("/indicators/rating", async (request, reply) => {
    const { symbol, timeframe = "1h", disabled, weights } = request.query as {
      symbol?: string;
      timeframe?: string;
      disabled?: string;
      weights?: string;
    };
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
      take: 300
    });
    if (!candles.length) {
      return reply.status(404).send({ message: "no candles for market" });
    }
    const sortedCandles = candles
      .map((c) => ({
        timestamp: Number(c.timestamp),
        close: Number(c.close)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    const latestClose = sortedCandles[sortedCandles.length - 1]?.close ?? null;
    const asOf = sortedCandles[sortedCandles.length - 1]?.timestamp ?? Date.now();

    const indicatorSnapshot = await prisma.indicatorSnapshot.findFirst({
      where: { marketId: market.id, timeframe },
      orderBy: { asOf: "desc" }
    });
    const latestIndicators = (indicatorSnapshot?.data as any)?.latest as IndicatorLatest | undefined;

    const parsedWeights = (() => {
      if (!weights) return undefined;
      try {
        const obj = JSON.parse(weights);
        return obj as any;
      } catch {
        return undefined;
      }
    })();

    const rating = computeRating(latestClose, latestIndicators ?? {}, {
      disabled: parseList(disabled),
      weights: parsedWeights
    });

    return reply.send({
      symbol,
      timeframe,
      asOf,
      close: latestClose,
      indicators: latestIndicators ?? null,
      rating
    });
  });
}
