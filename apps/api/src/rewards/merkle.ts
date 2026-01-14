import { parseUnits, keccak256, encodePacked } from "viem";
import { MerkleTree } from "merkletreejs";
import { chainConfig } from "../chain/config";

export type MerkleInput = {
  walletAddress: string;
  amount: string;
};

export type MerkleBuildResult = {
  root: `0x${string}`;
  proofs: Record<string, `0x${string}`[]>;
  leaves: { walletAddress: string; amount: bigint; leaf: `0x${string}` }[];
};

const toBuffer = (hex: `0x${string}`) => Buffer.from(hex.slice(2), "hex");

export const buildMerkleTree = (entries: MerkleInput[]): MerkleBuildResult => {
  const leaves = entries.map((entry) => {
    const amountWei = parseUnits(entry.amount, chainConfig.token.decimals);
    const leafHex = keccak256(
      encodePacked(["address", "uint256"], [entry.walletAddress as `0x${string}`, amountWei])
    );
    return { walletAddress: entry.walletAddress, amount: amountWei, leaf: leafHex };
  });

  const tree = new MerkleTree(
    leaves.map((l) => toBuffer(l.leaf)),
    (data: Buffer) => toBuffer(keccak256(data)),
    { sortPairs: true }
  );

  const root = (`0x${tree.getRoot().toString("hex")}`) as `0x${string}`;

  const proofs: Record<string, `0x${string}`[]> = {};
  for (const leaf of leaves) {
    const proof = tree.getProof(toBuffer(leaf.leaf)).map((p) => (`0x${p.data.toString("hex")}`) as `0x${string}`);
    proofs[leaf.walletAddress.toLowerCase()] = proof;
  }

  return {
    root,
    proofs,
    leaves
  };
};
