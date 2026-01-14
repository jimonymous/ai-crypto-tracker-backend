import Redis from "ioredis";
import { config } from "./config";

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true
});

redis.on("connect", () => {
  // eslint-disable-next-line no-console
  console.log("[redis] connected");
});

redis.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[redis] error", err);
});
