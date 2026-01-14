import { FastifyInstance } from "fastify";
import { getPremiumStatus } from "../chain/gating";

export default async function premiumRoutes(app: FastifyInstance) {
  app.get("/premium/status", async (request, reply) => {
    const { address, chainId, rpcUrl } = request.query as { address?: string; chainId?: string; rpcUrl?: string };
    if (!address) {
      return reply.status(400).send({ message: "address is required" });
    }

    try {
      const status = await getPremiumStatus(address, {
        chainId: chainId ? Number(chainId) : undefined,
        rpcUrl
      });
      return reply.send(status);
    } catch (err: any) {
      app.log.error(err);
      return reply.status(400).send({ message: err?.message ?? "failed to fetch premium status" });
    }
  });
}
