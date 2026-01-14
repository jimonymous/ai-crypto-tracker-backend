import { FastifyInstance } from "fastify";
import { dexCandleIngestionQueue } from "../queues";
import { getDexChain, getDexChains, isAllowedChain } from "../dex/config";
import { allowedDexIntervalsSeconds, isAllowedDexInterval } from "../dex/timeframes";

const DEFAULT_RATE_LIMIT = 5; // requests per second

export default async function dexIngestRoutes(app: FastifyInstance) {
  app.post("/dex/ingest/allowlist", async (request, reply) => {
    const body = (request.body || {}) as any;
    const chainId = body.chainId ? Number(body.chainId) : undefined;
    const windowMinutes = body.windowMinutes ? Number(body.windowMinutes) : 60;
    const intervalSeconds = body.intervalSeconds ? Number(body.intervalSeconds) : 300;
    const maxBlocks = body.maxBlocks ? Number(body.maxBlocks) : 500;
    const minSamples = body.minSamples ? Number(body.minSamples) : 3;
    const rateLimitPerSec = body.rateLimitPerSec ? Number(body.rateLimitPerSec) : DEFAULT_RATE_LIMIT;

    const targetChains = chainId ? [chainId] : getDexChains().map((c) => c.chainId);
    const enqueued: string[] = [];
    const skipped: string[] = [];

    for (const cid of targetChains) {
      if (!isAllowedChain(cid)) continue;
      const chain = getDexChain(cid);
      if (!chain) continue;
      for (const pool of chain.pools) {
        const jobId = `dex:${cid}:${pool.address}:${intervalSeconds}`;
        const existing = await dexCandleIngestionQueue.getJob(jobId);
        if (existing) {
          skipped.push(pool.address);
          continue;
        }
        if (!isAllowedDexInterval(intervalSeconds)) {
          return reply.status(400).send({
            message: `intervalSeconds ${intervalSeconds} not allowed; use one of ${allowedDexIntervalsSeconds.join(", ")}`
          });
        }
        await dexCandleIngestionQueue.add(
          jobId,
          {
            chainId: cid,
            poolAddress: pool.address,
            windowMinutes,
            intervalSeconds,
            maxBlocks,
            minSamples,
            rateLimitPerSec
          },
          {
            attempts: 2,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: 50,
            removeOnFail: 200,
            jobId
          }
        );
        enqueued.push(pool.address);
      }
    }

    return reply.send({
      enqueued: enqueued.length,
      skipped: skipped.length,
      windowMinutes,
      intervalSeconds,
      maxBlocks,
      minSamples,
      rateLimitPerSec,
      chainIds: targetChains
    });
  });
}
