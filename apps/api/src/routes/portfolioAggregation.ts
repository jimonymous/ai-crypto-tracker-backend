import { FastifyInstance } from "fastify";
import { verifyJwt } from "../auth/jwt";
import { aggregateBalances } from "../exchange/aggregation";

export default async function portfolioAggregationRoutes(app: FastifyInstance) {
  app.get("/portfolio/aggregate", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ message: "missing token" });
    const user = verifyJwt(authHeader.slice("Bearer ".length));
    const { exchanges } = request.query as { exchanges?: string };
    const list = exchanges ? exchanges.split(",").map((e) => e.trim()).filter(Boolean) : ["binance", "stub"];
    const res = await aggregateBalances(user.sub, list);
    return reply.send(res);
  });
}
