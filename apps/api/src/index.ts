import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import websocket from "@fastify/websocket";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config";
import { prisma } from "./db";
import { redis } from "./redis";
import { startWorkers } from "./queues/workers";
import { startIngestionScheduler } from "./queues/schedule";
import { closeQueues } from "./queues";
import snapshotRoutes from "./routes/snapshot";
import premiumRoutes from "./routes/premium";
import rewardsRoutes from "./routes/rewards";
import marketsRoutes from "./routes/markets";
import portfolioRoutes from "./routes/portfolio";
import marketDataRoutes from "./routes/marketData";
import walletRoutes from "./routes/wallet";
import authRoutes from "./routes/auth";
import chatRoutes from "./routes/chat";
import billingRoutes from "./routes/billing";
import wsRoutes from "./routes/ws";
import alertsRoutes from "./routes/alerts";
import complianceRoutes from "./routes/compliance";
import chainsRoutes from "./routes/chains";
import aiRoutes from "./routes/ai";
import exchangeRoutes from "./routes/exchange";
import portfolioAggregationRoutes from "./routes/portfolioAggregation";
import riskRoutes from "./routes/risk";
import metricsRoutes from "./routes/metrics";
import stakingRoutes from "./routes/staking";
import governanceRoutes from "./routes/governance";
import dexRoutes from "./routes/dex";
import dexHistoryRoutes from "./routes/dexHistory";
import dexRoutersRoutes from "./routes/dexRouters";
import dexCandlesRoutes from "./routes/dexCandles";
import dexIngestRoutes from "./routes/dexIngest";
import indicatorRatingRoutes from "./routes/indicators.rating";
import arbRoutes from "./routes/arb";
import arbHistoryRoutes from "./routes/arbHistory";
import { backupMarketData, restoreMarketData } from "./market/backup";

let stopWorkers: (() => Promise<void>) | null = null;
let stopScheduler: (() => Promise<void>) | null = null;
const workersEnabled = !config.API_DISABLE_WORKERS;
const schedulerEnabled = !config.API_DISABLE_SCHEDULER;

const app = Fastify({
  logger: {
    level: config.logLevel,
    transport: config.isProduction
      ? undefined
      : {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard"
          }
        }
  }
});

app.register(cors, {
  origin: config.corsOrigins === "*" ? true : config.corsOrigins,
  credentials: true
});

app.register(websocket);
app.register(helmet);
app.register(rateLimit, {
  max: config.RATE_LIMIT_MAX,
  timeWindow: config.RATE_LIMIT_WINDOW
});

app.register(swagger, {
  swagger: {
    info: {
      title: "AI Crypto Tracker API",
      description: "REST API for market data, AI, portfolios, premium, rewards",
      version: "0.1.0"
    },
    consumes: ["application/json"],
    produces: ["application/json"],
    externalDocs: {
      url: "docs/API.md",
      description: "API cheat sheet"
    }
  }
});
app.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: false
  }
});

app.register(snapshotRoutes);
app.register(premiumRoutes);
app.register(rewardsRoutes);
app.register(marketsRoutes);
app.register(portfolioRoutes);
app.register(marketDataRoutes);
app.register(walletRoutes);
app.register(authRoutes);
app.register(chatRoutes);
app.register(aiRoutes);
app.register(billingRoutes);
app.register(wsRoutes);
app.register(alertsRoutes);
app.register(complianceRoutes);
app.register(chainsRoutes);
app.register(exchangeRoutes);
app.register(dexRoutes);
app.register(arbRoutes);
app.register(dexHistoryRoutes);
app.register(dexRoutersRoutes);
app.register(dexCandlesRoutes);
app.register(dexIngestRoutes);
app.register(arbHistoryRoutes);
app.register(portfolioAggregationRoutes);
app.register(riskRoutes);
app.register(metricsRoutes);
app.register(stakingRoutes);
app.register(governanceRoutes);
app.register(indicatorRatingRoutes);

app.get("/health", async () => ({
  status: "ok",
  uptime: process.uptime(),
  timestamp: Date.now(),
  version: "0.1.0"
}));

app.setNotFoundHandler((request, reply) => {
  request.log.warn({ url: request.raw.url }, "Route not found");
  reply.status(404).send({ message: "Not Found" });
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "Unhandled error");
  const statusCode = error.statusCode ?? 500;
  const message = statusCode >= 500 ? "Internal Server Error" : error.message;
  reply.status(statusCode).send({ message });
});

app.addHook("onClose", async () => {
  if (stopScheduler) {
    await stopScheduler();
  }
  if (stopWorkers) {
    await stopWorkers();
  }
  await closeQueues();
  await prisma.$disconnect();
  await redis.quit();
});

const start = async () => {
  try {
    await redis.connect();
    await prisma.$connect();

    // Optional backup/restore to survive ephemeral DB restarts.
    if (process.env.RESTORE_MARKET_BACKUP_ON_BOOT === "true") {
      const backupPath = process.env.MARKET_BACKUP_PATH;
      const marketCount = await prisma.market.count();
      const candleCount = await prisma.candle.count();
      if (marketCount === 0 || candleCount === 0) {
        try {
          const res = await restoreMarketData(backupPath);
          app.log.info({ msg: "restored market backup", res });
        } catch (err) {
          app.log.error({ msg: "failed to restore market backup", err });
        }
      }
    }
    if (process.env.BACKUP_MARKET_DATA_ON_START === "true") {
      const backupPath = process.env.MARKET_BACKUP_PATH;
      backupMarketData(backupPath)
        .then((res) => app.log.info({ msg: "wrote market backup", res }))
        .catch((err) => app.log.error({ msg: "failed to write market backup", err }));
    }

    if (workersEnabled) {
      const workerManager = startWorkers();
      stopWorkers = workerManager.close;
    } else {
      app.log.info("Workers disabled via API_DISABLE_WORKERS");
    }

    if (schedulerEnabled) {
      const scheduler = await startIngestionScheduler();
      stopScheduler = scheduler.stop;
    } else {
      app.log.info("Scheduler disabled via API_DISABLE_SCHEDULER");
    }

    await app.listen({ port: config.API_PORT, host: config.API_HOST });
    app.log.info(`API running on http://${config.API_HOST}:${config.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

void start();
