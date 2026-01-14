import { decodeEventLog, decodeFunctionData } from "viem";
import { tokenAbi } from "./abis";
import { ChainConfig } from "./config";
import { makePublicClient } from "./publicClient";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const verifyErc20Transfer = async (
  {
    txHash,
    tokenAddress,
    from,
    to,
    minAmount
  }: {
    txHash: `0x${string}`;
    tokenAddress: `0x${string}`;
    from: `0x${string}` | null;
    to: `0x${string}`;
    minAmount: bigint;
  },
  chain: ChainConfig
) => {
  const client = makePublicClient(chain);
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return false;

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== tokenAddress.toLowerCase()) continue;
    if (!log.topics || !log.topics.length || !log.topics[0] || log.topics[0].toLowerCase() !== TRANSFER_TOPIC) continue;
    const decoded = decodeEventLog({
      abi: tokenAbi,
      data: log.data,
      topics: log.topics
    }) as any;
    const args = decoded.args as { from: string; to: string; value: bigint };
    if (from && args.from.toLowerCase() !== from.toLowerCase()) continue;
    if (args.to.toLowerCase() !== to.toLowerCase()) continue;
    if (args.value < minAmount) continue;
    return true;
  }

  // Fallback: decode transaction input if logs are missing/mismatched
  const tx = await client.getTransaction({ hash: txHash });
  if (!tx || !tx.input) return false;
  if (!tx.to || tx.to.toLowerCase() !== tokenAddress.toLowerCase()) return false;
  const decodedTx = decodeFunctionData({ abi: tokenAbi, data: tx.input });
  if (decodedTx.functionName !== "transfer") return false;
  const [toArg, amount] = decodedTx.args as [string, bigint];
  if (from && tx.from && tx.from.toLowerCase() !== from.toLowerCase()) return false;
  if (toArg.toLowerCase() !== to.toLowerCase()) return false;
  if (BigInt(amount) < minAmount) return false;
  return true;
};
