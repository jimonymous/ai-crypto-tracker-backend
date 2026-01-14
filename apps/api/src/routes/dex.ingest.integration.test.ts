import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import dexIngestRoutes from "./dexIngest";
import { dexCandleIngestionQueue } from "../queues";

describe("/dex/ingest/allowlist", () => {
  beforeAll(async () => {
    if (!process.env.REDIS_URL) return;
    // keep queue clean between runs
    await dexCandleIngestionQueue.drain(true);
  });

  it("enqueues ingestion jobs for allowlisted pools", async () => {
    if (!process.env.REDIS_URL || !process.env.ETH_MAINNET_RPC) {
      console.warn("Missing REDIS_URL or ETH_MAINNET_RPC; skipping dex ingest test");
      return;
    }

    const app = Fastify();
    await app.register(dexIngestRoutes);
    await app.ready();

    const beforeCount = await dexCandleIngestionQueue.count();
    const res = await app.inject({
      method: "POST",
      url: "/dex/ingest/allowlist",
      payload: {
        chainId: 1,
        windowMinutes: 1,
        intervalSeconds: 300,
        maxBlocks: 300,
        minSamples: 1,
        rateLimitPerSec: 5
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enqueued + (body.skipped ?? 0)).toBeGreaterThan(0);

    const afterCount = await dexCandleIngestionQueue.count();
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount);

    await app.close();
  });

  afterAll(async () => {
    if (!process.env.REDIS_URL) return;
    await dexCandleIngestionQueue.close();
  });
});
