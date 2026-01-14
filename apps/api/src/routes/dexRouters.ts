import { FastifyInstance } from "fastify";
import { dexRouters } from "../dex/routers";

export default async function dexRoutersRoutes(app: FastifyInstance) {
  app.get(
    "/dex/routers",
    { config: { rateLimit: { max: 10, timeWindow: 10_000 } } },
    async (request, reply) => {
      const q = request.query as any;
      const chainId = q?.chainId ? Number(q.chainId) : null;
      const network = (q?.network as string) || null;
      const dex = (q?.dex as string) || null;
      const version = (q?.version as string) || null;
      const filtered = dexRouters.filter((r) => {
        if (chainId && r.chainId !== chainId) return false;
        if (network && r.network.toLowerCase() !== network.toLowerCase()) return false;
        if (dex && r.dex.toLowerCase() !== dex.toLowerCase()) return false;
        if (version && r.version.toLowerCase() !== version.toLowerCase()) return false;
        return true;
      });
      return reply.send({ routers: filtered });
    }
  );
}
