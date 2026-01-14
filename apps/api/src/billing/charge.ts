import { ChainConfig } from "../chain/config";
import { buildChain, makePublicClient, makeWalletClient } from "../chain/publicClient";
import { tokenAbi } from "../chain/abis";

export const attemptAutoCharge = async (from: string, amountWei: bigint, chain: ChainConfig) => {
  const publicClient = makePublicClient(chain);
  const walletClient = makeWalletClient(chain);
  if (!walletClient) {
    throw new Error("Charger wallet not configured");
  }

  const allowanceFn = "allowance" as any;
  let allowance: bigint | null = null;
  try {
    allowance = (await publicClient.readContract({
      address: chain.token.address as `0x${string}`,
      abi: [
        ...tokenAbi,
        {
          inputs: [
            { internalType: "address", name: "owner", type: "address" },
            { internalType: "address", name: "spender", type: "address" }
          ],
          name: "allowance",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function"
        }
      ],
      functionName: allowanceFn,
      args: [from as `0x${string}`, walletClient.account!.address as `0x${string}`]
    })) as bigint;
  } catch {
    allowance = null;
  }

  if (allowance !== null && allowance < amountWei) {
    throw Object.assign(new Error("INSUFFICIENT_ALLOWANCE"), { statusCode: 402 });
  }

  const hash = await walletClient.writeContract({
    address: chain.token.address as `0x${string}`,
    abi: tokenAbi as any,
    functionName: "transferFrom",
    args: [from as `0x${string}`, chain.treasury as `0x${string}`, amountWei],
    chain: buildChain(chain)
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
};
