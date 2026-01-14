import { FastifyInstance } from "fastify";
import type { FastifyRequest } from "fastify";
import type { SocketStream } from "@fastify/websocket";
import { prisma } from "../db";
import { redis } from "../redis";

type SubscribeMessage = {
  type: "subscribe";
  symbol: string;
  timeframe: string;
};

const toNumber = (val: any) => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  return Number(val);
};

const serializeSnapshot = async (symbol: string, timeframe: string) => {
  const market = await prisma.market.findFirst({ where: { symbol, timeframe } });
  if (!market) return null;

  const candles = await prisma.candle.findMany({
    where: { marketId: market.id, timeframe },
    orderBy: { timestamp: "desc" },
    take: 150
  });

  const indicator = await prisma.indicatorSnapshot.findFirst({
    where: { marketId: market.id, timeframe },
    orderBy: { asOf: "desc" }
  });

  const predKey = `prediction:latest:${market.id}:${timeframe}`;
  let prediction: any = null;
  const cached = await redis.get(predKey);
  if (cached) {
    prediction = JSON.parse(cached);
  } else {
    prediction = await prisma.modelPrediction.findFirst({
      where: { marketId: market.id, timeframe },
      orderBy: { asOf: "desc" }
    });
  }

  return {
    symbol,
    timeframe,
    asOf: candles.length ? Number(candles[0].timestamp) : Date.now(),
    lastClose: candles.length ? toNumber(candles[0].close) : null,
    candles: candles
      .map((c) => ({
        timestamp: Number(c.timestamp),
        open: toNumber(c.open),
        high: toNumber(c.high),
        low: toNumber(c.low),
        close: toNumber(c.close),
        volume: toNumber(c.volume)
      }))
      .reverse(),
    indicators: (indicator?.data as any)?.latest ?? null,
    prediction: prediction
      ? {
          probabilities: (prediction as any).probabilities,
          regime: (prediction as any).regime,
          asOf: Number((prediction as any).asOf ?? Date.now())
        }
      : null
  };
};

export default async function wsRoutes(app: FastifyInstance) {
  app.get(
    "/ws/updates",
    { websocket: true },
    async (connection: SocketStream, req: FastifyRequest) => {
      let interval: NodeJS.Timeout | null = null;
      const sub = redis.duplicate();
      await sub.connect();

      const send = (data: any) => {
        try {
          connection.socket.send(JSON.stringify(data));
        } catch {
          // ignore
        }
      };

      connection.socket.on("message", async (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as SubscribeMessage;
          if (msg.type !== "subscribe" || !msg.symbol) return;
          if (interval) clearInterval(interval);

          const push = async () => {
            const snapshot = await serializeSnapshot(msg.symbol, msg.timeframe ?? "1h");
            if (snapshot) send({ type: "snapshot", payload: snapshot });
          };

          await push();
          interval = setInterval(push, 10_000);
        } catch (err) {
          req.log.error(err);
        }
      });

      await sub.subscribe("alerts");
      sub.on("message", (channel: string, payload: string) => {
        if (channel !== "alerts") return;
        try {
          const data = JSON.parse(payload);
          send({ type: "alert", payload: data });
        } catch {
          // ignore parse errors
        }
      });

      connection.socket.on("close", () => {
        if (interval) clearInterval(interval);
        sub.disconnect();
      });
    }
  );
}
