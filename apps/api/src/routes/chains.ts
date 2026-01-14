import { FastifyInstance } from "fastify";
import { chains } from "../chain/config";

export default async function chainsRoutes(app: FastifyInstance) {
  app.get("/chains", async (_request, reply) => {
    return reply.send(
      chains.map((c) => ({
        id: c.id,
        name: c.name,
        rpcUrl: c.rpcUrl,
        tokenAddress: c.token.address,
        premiumPassAddress: c.premiumPass.address,
        rewardsAddress: c.rewards.address,
        treasury: c.treasury,
        decimals: c.token.decimals
      }))
    );
  });
}
