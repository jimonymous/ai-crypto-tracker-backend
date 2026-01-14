import { FastifyInstance } from "fastify";
import { isAddress } from "viem";
import { prisma } from "../db";
import { selectChainWithRpc } from "../chain/config";

export default async function rewardsRoutes(app: FastifyInstance) {
  app.get("/rewards/epoch/latest", async (request, reply) => {
    const { chainId } = request.query as { chainId?: string };
    const chain = selectChainWithRpc(chainId ? Number(chainId) : undefined);
    const latestReceipt = await prisma.onchainReceipt.findFirst({
      orderBy: { anchoredAt: "desc" }
    });

    const payload = (latestReceipt?.payload as any) ?? {};

    return reply.send({
      epoch: payload.epochId ?? null,
      root: payload.root ?? null,
      txHash: latestReceipt?.hash ?? null,
      chainId: latestReceipt?.chainId ?? chain.chainId,
      contract: chain.rewards.address
    });
  });

  app.get("/rewards/proof", async (request, reply) => {
    const { address, epoch, chainId, rpcUrl } = request.query as {
      address?: string;
      epoch?: string;
      chainId?: string;
      rpcUrl?: string;
    };
    const chain = selectChainWithRpc(chainId ? Number(chainId) : undefined, rpcUrl);
    if (!address || !isAddress(address)) {
      return reply.status(400).send({ message: "valid address is required" });
    }

    const user = await prisma.user.findUnique({ where: { walletAddress: address } });
    if (!user) {
      return reply.status(404).send({ message: "user not found for address" });
    }

    let targetEpoch = epoch;
    if (!targetEpoch) {
      const latest = await prisma.rewardAccrual.findFirst({
        where: { userId: user.id },
        orderBy: { claimableAt: "desc" }
      });
      targetEpoch = latest?.cycle ?? undefined;
    }

    if (!targetEpoch) {
      return reply.status(404).send({ message: "no rewards for address" });
    }

    const accrual = await prisma.rewardAccrual.findFirst({
      where: { userId: user.id, cycle: targetEpoch }
    });

    if (!accrual) {
      return reply.status(404).send({ message: "no accrual for epoch" });
    }

    return reply.send({
      epoch: targetEpoch,
      amount: accrual.amount.toString(),
      token: accrual.token,
      proof: (accrual.merkleProof as any) ?? [],
      status: accrual.status,
      claimableAt: accrual.claimableAt,
      expiresAt: accrual.expiresAt,
      contract: chain.rewards.address,
      tokenAddress: chain.token.address
    });
  });

  app.get("/rewards/history", async (request, reply) => {
    const { address } = request.query as { address?: string };
    if (!address || !isAddress(address)) {
      return reply.status(400).send({ message: "valid address is required" });
    }

    const user = await prisma.user.findUnique({ where: { walletAddress: address } });
    if (!user) {
      return reply.status(404).send({ message: "user not found for address" });
    }

    const history = await prisma.rewardAccrual.findMany({
      where: { userId: user.id },
      orderBy: { claimableAt: "desc" }
    });

    return reply.send(
      history.map((h) => ({
        epoch: h.cycle,
        amount: h.amount.toString(),
        token: h.token,
        status: h.status,
        claimableAt: h.claimableAt,
        expiresAt: h.expiresAt,
        proof: (h.merkleProof as any) ?? []
      }))
    );
  });
}
