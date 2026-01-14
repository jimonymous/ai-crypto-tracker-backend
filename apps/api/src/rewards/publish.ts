import { prisma } from "../db";
import { chainConfig } from "../chain/config";
import { walletClient, publicClient, buildChain } from "../chain/publicClient";
import { buildMerkleTree } from "./merkle";

export const publishRewardsEpoch = async (epochId: string) => {
  const accruals = await prisma.rewardAccrual.findMany({
    where: { cycle: epochId, status: { in: ["pending", "claimable"] } },
    include: { user: { select: { walletAddress: true } } }
  });

  const entries = accruals
    .filter((a) => a.user.walletAddress)
    .map((a) => ({ walletAddress: a.user.walletAddress as string, amount: a.amount.toString() }));

  if (!entries.length) {
    throw new Error(`No accrual entries for epoch ${epochId}`);
  }

  const { root, proofs, leaves } = buildMerkleTree(entries);

  if (!walletClient) {
    throw new Error("CHAIN_PRIVATE_KEY not configured; cannot publish root");
  }

  const epochNumber = BigInt(epochId);

  const txHash = await walletClient.writeContract({
    address: chainConfig.rewards.address as `0x${string}`,
    abi: chainConfig.rewards.abi,
    functionName: "setMerkleRoot",
    args: [epochNumber, root],
    chain: buildChain(chainConfig)
  });

  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const proofsByUserId: Record<string, string[]> = {};
  for (const acc of accruals) {
    const addr = (acc.user.walletAddress ?? "").toLowerCase();
    proofsByUserId[acc.id] = proofs[addr] ?? [];
  }

  for (const acc of accruals) {
    const proof = proofsByUserId[acc.id] ?? [];
    await prisma.rewardAccrual.update({
      where: { id: acc.id },
      data: {
        status: "claimable",
        merkleProof: proof
      }
    });
  }

  await prisma.onchainReceipt.create({
    data: {
      hash: txHash,
      chainId: chainConfig.chainId,
      payload: {
        epochId,
        root,
        leaves: leaves.length
      }
    }
  });

  return { epochId, root, txHash, entries: entries.length };
};
