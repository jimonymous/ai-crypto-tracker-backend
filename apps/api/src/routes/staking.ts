import { FastifyInstance } from "fastify";
import { selectChain } from "../chain/config";
import { makePublicClient, makeWalletClient, buildChain } from "../chain/publicClient";
import { stakingAbi, tokenAbi } from "../chain/abis";
import { parseUnits } from "viem";
import { verifyJwt } from "../auth/jwt";

export default async function stakingRoutes(app: FastifyInstance) {
  app.get("/staking/:address", async (request, reply) => {
    const chain = selectChain();
    const stakingAddress = chain.staking?.address;
    if (!stakingAddress || stakingAddress === "0x0000000000000000000000000000000000000000") {
      return reply.status(400).send({ message: "staking not configured" });
    }
    const publicClient = makePublicClient(chain);
    const { address } = request.params as { address: `0x${string}` };
    const [balance, total] = await Promise.all([
      publicClient.readContract({
        address: stakingAddress as `0x${string}`,
        abi: stakingAbi,
        functionName: "balances",
        args: [address]
      }) as Promise<bigint>,
      publicClient.readContract({
        address: stakingAddress as `0x${string}`,
        abi: stakingAbi,
        functionName: "totalStaked"
      }) as Promise<bigint>
    ]);
    return reply.send({ stakingAddress, balance: balance.toString(), totalStaked: total.toString() });
  });

  app.post("/staking/stake", { config: { rateLimit: { max: 5, timeWindow: 10_000 } } }, async (request, reply) => {
    const chain = selectChain();
    const stakingAddress = chain.staking?.address;
    if (!stakingAddress || stakingAddress === "0x0000000000000000000000000000000000000000") {
      return reply.status(400).send({ message: "staking not configured" });
    }
    const walletClient = makeWalletClient(chain);
    if (!walletClient) return reply.status(400).send({ message: "CHAIN_PRIVATE_KEY not set" });
    const body = request.body as { amount: string };
    if (!body.amount) return reply.status(400).send({ message: "amount required" });
    const amount = parseUnits(body.amount, chain.token.decimals);
    const pub = makePublicClient(chain);
    try {
      const allowance = await pub.readContract({
        address: chain.token.address as `0x${string}`,
        abi: tokenAbi,
        functionName: "allowance",
        args: [walletClient.account!.address, stakingAddress as `0x${string}`]
      }) as bigint;
      if (allowance < amount) {
        const approveHash = await walletClient.writeContract({
          chain: buildChain(chain),
          address: chain.token.address as `0x${string}`,
          abi: tokenAbi,
          functionName: "approve",
          args: [stakingAddress as `0x${string}`, amount]
        });
        await pub.waitForTransactionReceipt({ hash: approveHash });
      }
      const hash = await walletClient.writeContract({
        chain: buildChain(chain),
        address: stakingAddress as `0x${string}`,
        abi: stakingAbi,
        functionName: "stake",
        args: [amount]
      });
      await pub.waitForTransactionReceipt({ hash });
      return reply.send({ hash });
    } catch (err: any) {
      const message = err?.shortMessage || err?.message || "stake failed";
      return reply.status(500).send({ message });
    }
  });

  app.post("/staking/unstake", { config: { rateLimit: { max: 5, timeWindow: 10_000 } } }, async (request, reply) => {
    const chain = selectChain();
    const stakingAddress = chain.staking?.address;
    if (!stakingAddress || stakingAddress === "0x0000000000000000000000000000000000000000") {
      return reply.status(400).send({ message: "staking not configured" });
    }
    const walletClient = makeWalletClient(chain);
    if (!walletClient) return reply.status(400).send({ message: "CHAIN_PRIVATE_KEY not set" });
    const body = request.body as { amount: string };
    if (!body.amount) return reply.status(400).send({ message: "amount required" });
    const amount = parseUnits(body.amount, chain.token.decimals);
    const pub = makePublicClient(chain);
    const hash = await walletClient.writeContract({
      chain: buildChain(chain),
      address: stakingAddress as `0x${string}`,
      abi: stakingAbi,
      functionName: "unstake",
      args: [amount]
    });
    await pub.waitForTransactionReceipt({ hash });
    return reply.send({ hash });
  });
}
