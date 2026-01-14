import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { verifyJwt } from "../auth/jwt";

const authGuard = async (request: any, reply: any) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    reply.status(401).send({ message: "missing token" });
    return null;
  }
  const token = authHeader.slice("Bearer ".length);
  const payload = verifyJwt(token);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    reply.status(401).send({ message: "user not found" });
    return null;
  }
  return user;
};

export default async function alertsRoutes(app: FastifyInstance) {
  app.get("/alerts", async (request, reply) => {
    const user = await authGuard(request, reply);
    if (!user) return;
    const alerts = await prisma.alert.findMany({ where: { userId: user.id } });
    return reply.send(alerts);
  });

  app.post("/alerts", async (request, reply) => {
    const user = await authGuard(request, reply);
    if (!user) return;
    const body = request.body as {
      marketId: string;
      type: "price_above" | "price_below";
      threshold: number;
      timeframe: string;
    };
    if (!body?.marketId || !body?.type || typeof body.threshold !== "number") {
      return reply.status(400).send({ message: "marketId, type, threshold required" });
    }
    const alert = await prisma.alert.create({
      data: {
        userId: user.id,
        marketId: body.marketId,
        type: body.type,
        condition: { threshold: body.threshold, timeframe: body.timeframe ?? "1h" },
        status: "active"
      }
    });
    return reply.send(alert);
  });

  app.delete("/alerts/:id", async (request, reply) => {
    const user = await authGuard(request, reply);
    if (!user) return;
    const { id } = request.params as { id: string };
    await prisma.alert.deleteMany({ where: { id, userId: user.id } });
    return reply.send({ status: "deleted" });
  });
}
