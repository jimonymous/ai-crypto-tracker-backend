import { FastifyInstance } from "fastify";
import os from "os";
import { queues } from "../queues";

export default async function metricsRoutes(app: FastifyInstance) {
  app.get("/metrics", async (_request, reply) => {
    const mem = process.memoryUsage();
    const counts = await Promise.all(
      Object.entries(queues).map(async ([name, q]) => {
        const waiting = await q.getWaitingCount();
        const active = await q.getActiveCount();
        const completed = await q.getCompletedCount();
        const failed = await q.getFailedCount();
        return { name, waiting, active, completed, failed };
      })
    );
    return reply.send({
      uptime: process.uptime(),
      loadavg: os.loadavg(),
      memory: { rss: mem.rss, heapUsed: mem.heapUsed },
      queues: counts
    });
  });
}
