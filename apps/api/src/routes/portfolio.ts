import { FastifyInstance } from "fastify";
import { prisma } from "../db";

const toNumber = (val: any) => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  return Number(val);
};

const findOrCreateUserByWallet = async (walletAddress: string) => {
  let user = await prisma.user.findUnique({ where: { walletAddress } });
  if (!user) {
    user = await prisma.user.create({
      data: { walletAddress }
    });
  }
  return user;
};

const priceForAsset = async (assetSymbol: string) => {
  const market = await prisma.market.findFirst({
    where: { baseAsset: assetSymbol },
    orderBy: { updatedAt: "desc" }
  });
  if (!market) return null;
  const candle = await prisma.candle.findFirst({
    where: { marketId: market.id },
    orderBy: { timestamp: "desc" }
  });
  if (!candle) return null;
  return toNumber(candle.close);
};

export default async function portfolioRoutes(app: FastifyInstance) {
  app.get("/portfolio/holdings", async (request, reply) => {
    const { wallet } = request.query as { wallet?: string };
    if (!wallet) {
      return reply.status(400).send({ message: "wallet is required" });
    }

    const user = await prisma.user.findUnique({ where: { walletAddress: wallet } });
    if (!user) {
      return reply.send({ holdings: [], totalValue: 0 });
    }

    const holdings = await prisma.portfolioHolding.findMany({
      where: { userId: user.id }
    });

    let totalValue = 0;
    const enriched: Array<{
      assetSymbol: string;
      quantity: number;
      averageCost: number | null;
      price: number | null;
      value: number | null;
    }> = [];
    for (const h of holdings) {
      const price = await priceForAsset(h.assetSymbol);
      const quantity = toNumber(h.quantity);
      const value = price != null ? quantity * price : null;
      if (value != null) totalValue += value;
      enriched.push({
        assetSymbol: h.assetSymbol,
        quantity,
        averageCost: h.averageCost ? toNumber(h.averageCost) : null,
        price,
        value
      });
    }

    return reply.send({ holdings: enriched, totalValue });
  });

  app.post("/portfolio/holdings", async (request, reply) => {
    const body = request.body as {
      wallet: string;
      assetSymbol: string;
      quantity: number;
      averageCost?: number;
    };

    if (!body?.wallet || !body?.assetSymbol) {
      return reply.status(400).send({ message: "wallet and assetSymbol are required" });
    }

    const user = await findOrCreateUserByWallet(body.wallet);

    const holding = await prisma.portfolioHolding.upsert({
      where: {
        userId_assetSymbol: {
          userId: user.id,
          assetSymbol: body.assetSymbol
        }
      },
      create: {
        userId: user.id,
        assetSymbol: body.assetSymbol,
        quantity: body.quantity,
        averageCost: body.averageCost ?? null
      },
      update: {
        quantity: body.quantity,
        averageCost: body.averageCost ?? null
      }
    });

    return reply.send({
      assetSymbol: holding.assetSymbol,
      quantity: toNumber(holding.quantity),
      averageCost: holding.averageCost ? toNumber(holding.averageCost) : null
    });
  });
}
