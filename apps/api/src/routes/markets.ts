import { FastifyInstance } from "fastify";
import { prisma } from "../db";

const toNumber = (val: any) => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  return Number(val);
};

const since24h = () => BigInt(Date.now() - 24 * 60 * 60 * 1000);

const marketSummary = async (marketId: string, symbol: string, baseAsset: string, quoteAsset: string) => {
  const latest = await prisma.candle.findFirst({
    where: { marketId },
    orderBy: { timestamp: "desc" }
  });

  const previous = await prisma.candle.findFirst({
    where: { marketId, timestamp: { lte: since24h() } },
    orderBy: { timestamp: "desc" }
  });

  const lastClose = toNumber(latest?.close);
  const prevClose = toNumber(previous?.close);
  const change24h = prevClose ? ((lastClose - prevClose) / prevClose) * 100 : null;

  const candles24h = await prisma.candle.findMany({
    where: { marketId, timestamp: { gte: since24h() } }
  });

  const volume24h = candles24h.reduce((sum, c) => sum + toNumber(c.volume), 0);

  return {
    marketId,
    symbol,
    baseAsset,
    quoteAsset,
    lastClose,
    change24h,
    volume24h
  };
};

export default async function marketsRoutes(app: FastifyInstance) {
  app.get("/markets", async (_request, reply) => {
    const markets = await prisma.market.findMany();
    const summaries = await Promise.all(
      markets.map((m) => marketSummary(m.id, m.symbol, m.baseAsset, m.quoteAsset))
    );
    return reply.send(summaries);
  });

  app.get("/markets/stats", async (_request, reply) => {
    const markets = await prisma.market.findMany();
    const summaries = await Promise.all(
      markets.map((m) => marketSummary(m.id, m.symbol, m.baseAsset, m.quoteAsset))
    );

    const totalVolume24h = summaries.reduce((sum, s) => sum + s.volume24h, 0);
    const btc = summaries.find((s) => s.baseAsset.toUpperCase() === "BTC");
    const btcDominance =
      btc && totalVolume24h > 0 ? (btc.volume24h / totalVolume24h) * 100 : null;

    const trending = [...summaries]
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 5)
      .map((s) => ({ symbol: s.symbol, volume24h: s.volume24h, change24h: s.change24h }));

    return reply.send({
      totalVolume24h,
      btcDominance,
      trending
    });
  });
}
