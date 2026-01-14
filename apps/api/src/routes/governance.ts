import { FastifyInstance } from "fastify";
import { selectChain } from "../chain/config";
import { makePublicClient, makeWalletClient, buildChain } from "../chain/publicClient";
import { governanceAbi } from "../chain/abis";
import { verifyJwt } from "../auth/jwt";

export default async function governanceRoutes(app: FastifyInstance) {
  app.get("/governance/proposals", async (_request, reply) => {
    const chain = selectChain();
    const govAddress = chain.governance?.address;
    if (!govAddress || govAddress === "0x0000000000000000000000000000000000000000") {
      return reply.status(400).send({ message: "governance not configured" });
    }
    const publicClient = makePublicClient(chain);
    const count = (await publicClient.readContract({
      address: govAddress as `0x${string}`,
      abi: governanceAbi,
      functionName: "proposalCount"
    })) as bigint;
    const proposals: any[] = [];
    for (let i = 1n; i <= count; i++) {
      const p = await publicClient.readContract({
        address: govAddress as `0x${string}`,
        abi: governanceAbi,
        functionName: "proposals",
        args: [i]
      }) as any;
      proposals.push(p);
    }
    return reply.send({ proposals });
  });

  app.post("/governance/create", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ message: "missing token" });
    verifyJwt(authHeader.slice("Bearer ".length));
    const chain = selectChain();
    const govAddress = chain.governance?.address;
    if (!govAddress || govAddress === "0x0000000000000000000000000000000000000000") {
      return reply.status(400).send({ message: "governance not configured" });
    }
    const walletClient = makeWalletClient(chain);
    if (!walletClient) return reply.status(400).send({ message: "CHAIN_PRIVATE_KEY not set" });
    const body = request.body as { description?: string };
    if (!body.description) return reply.status(400).send({ message: "description required" });
    const hash = await walletClient.writeContract({
      chain: buildChain(chain),
      address: govAddress as `0x${string}`,
      abi: governanceAbi,
      functionName: "createProposal",
      args: [body.description]
    });
    return reply.send({ hash });
  });

  app.post("/governance/vote", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return reply.status(401).send({ message: "missing token" });
    verifyJwt(authHeader.slice("Bearer ".length));
    const chain = selectChain();
    const govAddress = chain.governance?.address;
    if (!govAddress || govAddress === "0x0000000000000000000000000000000000000000") {
      return reply.status(400).send({ message: "governance not configured" });
    }
    const walletClient = makeWalletClient(chain);
    if (!walletClient) return reply.status(400).send({ message: "CHAIN_PRIVATE_KEY not set" });
    const body = request.body as { proposalId?: number; support?: boolean; weight?: string };
    if (!body.proposalId || body.support === undefined || !body.weight) {
      return reply.status(400).send({ message: "proposalId, support, weight required" });
    }
    const weight = BigInt(body.weight);
    const hash = await walletClient.writeContract({
      chain: buildChain(chain),
      address: govAddress as `0x${string}`,
      abi: governanceAbi,
      functionName: "vote",
      args: [BigInt(body.proposalId), body.support, weight]
    });
    return reply.send({ hash });
  });
}
