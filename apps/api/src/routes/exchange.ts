import { FastifyInstance } from "fastify";
import { verifyJwt } from "../auth/jwt";
import { saveCredentials, loadCredentials } from "../exchange/credentials";
import { aggregateBalances } from "../exchange/aggregation";
import { placePaperOrder, listPaperOrders } from "../exchange/paper";
import { fetchBinanceBalances } from "../exchange/binance";

export default async function exchangeRoutes(app: FastifyInstance) {
  app.post("/exchange/keys", { config: { rateLimit: { max: 5, timeWindow: 10_000 } } }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ message: "missing token" });
    const user = verifyJwt(authHeader.slice("Bearer ".length));
    const body = request.body as { exchange: string; apiKey?: string; secret?: string };
    if (!body.exchange || !body.apiKey || !body.secret) {
      return reply.status(400).send({ message: "exchange, apiKey, secret required" });
    }
    await saveCredentials(user.sub, body.exchange, { apiKey: body.apiKey, secret: body.secret });
    return reply.send({ status: "stored" });
  });

  app.get("/exchange/balances", { config: { rateLimit: { max: 5, timeWindow: 10_000 } } }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ message: "missing token" });
    const user = verifyJwt(authHeader.slice("Bearer ".length));
    const { exchange, aggregate } = request.query as { exchange?: string; aggregate?: string };
    const ex = (exchange ?? "binance").toLowerCase();

    if (aggregate === "true") {
      const res = await aggregateBalances(user.sub, [ex, "stub"]);
      return reply.send(res);
    }

    if (ex === "binance") {
      const creds = await loadCredentials(user.sub, "binance");
      if (!creds) return reply.status(400).send({ message: "no credentials stored" });
      const bal = await fetchBinanceBalances(creds);
      return reply.send(bal);
    }

    return reply.status(400).send({ message: "unsupported exchange" });
  });

  app.post("/exchange/paper/orders", { config: { rateLimit: { max: 10, timeWindow: 10_000 } } }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ message: "missing token" });
    const user = verifyJwt(authHeader.slice("Bearer ".length));
    const body = request.body as {
      exchange: string;
      symbol: string;
      side: "buy" | "sell";
      type: "market" | "limit";
      amount: number;
      price?: number;
    };
    if (!body.exchange || !body.symbol || !body.side || !body.type || !body.amount) {
      return reply.status(400).send({ message: "exchange, symbol, side, type, amount required" });
    }
    const order = await placePaperOrder({
      userId: user.sub,
      exchange: body.exchange,
      symbol: body.symbol,
      side: body.side,
      type: body.type,
      amount: body.amount,
      price: body.price
    });
    return reply.send(order);
  });

  app.get("/exchange/paper/orders", { config: { rateLimit: { max: 10, timeWindow: 10_000 } } }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ message: "missing token" });
    const user = verifyJwt(authHeader.slice("Bearer ".length));
    const orders = await listPaperOrders(user.sub);
    return reply.send({ orders });
  });
}
