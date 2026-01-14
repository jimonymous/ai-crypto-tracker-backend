import { parseUnits, isAddress } from "viem";
import { TokenGateRequirement, TokenGateState } from "@crypto-tracker/shared";
import { getPrimaryChain, selectChainWithRpc, ChainConfig } from "./config";
import { makePublicClient } from "./publicClient";

const tokenDecimalsCache = new Map<number, number>();

const getTokenDecimals = async (chain: ChainConfig) => {
  const cached = tokenDecimalsCache.get(chain.id);
  if (cached !== undefined) return cached;
  const client = makePublicClient(chain);
  try {
    const decimals = await client.readContract({
      address: chain.token.address as `0x${string}`,
      abi: chain.token.abi,
      functionName: "decimals"
    });
    const num = Number(decimals);
    tokenDecimalsCache.set(chain.id, num);
    return num;
  } catch {
    tokenDecimalsCache.set(chain.id, chain.token.decimals);
  }
  return chain.token.decimals;
};

const buildRequirements = async (chain: ChainConfig): Promise<TokenGateRequirement[]> => {
  const decimals = await getTokenDecimals(chain);
  const minTokenBalance = chain.token.minBalance;

  const tokenReq: TokenGateRequirement = {
    chainId: chain.id,
    minTokenBalance,
    tokenAddress: chain.token.address,
    tokenSymbol: process.env.REWARD_TOKEN_SYMBOL || "CTT",
    role: "premium"
  };

  const nftReq: TokenGateRequirement = {
    chainId: chain.id,
    minNftBalance: 1,
    nftAddress: chain.premiumPass.address,
    role: "premium"
  };

  // Normalize minTokenBalance to base units string
  if (minTokenBalance && minTokenBalance !== "0") {
    tokenReq.minTokenBalance = parseUnits(minTokenBalance, decimals).toString();
  }

  return [tokenReq, nftReq];
};

const hasTokenBalance = async (walletAddress: string, minBalanceWei: bigint, chain: ChainConfig): Promise<boolean> => {
  if (!chain.token.address || chain.token.address === "0x0000000000000000000000000000000000000000") {
    return false;
  }
  const client = makePublicClient(chain);
  const balance = await client.readContract({
    address: chain.token.address as `0x${string}`,
    abi: chain.token.abi,
    functionName: "balanceOf",
    args: [walletAddress as `0x${string}`]
  });
  return balance >= minBalanceWei;
};

const hasPremiumPass = async (walletAddress: string, chain: ChainConfig): Promise<boolean> => {
  if (
    !chain.premiumPass.address ||
    chain.premiumPass.address === "0x0000000000000000000000000000000000000000"
  ) {
    return false;
  }
  const client = makePublicClient(chain);
  const balance = await client.readContract({
    address: chain.premiumPass.address as `0x${string}`,
    abi: chain.premiumPass.abi,
    functionName: "balanceOf",
    args: [walletAddress as `0x${string}`]
  });
  return balance > 0n;
};

export const getPremiumStatus = async (
  walletAddress: string,
  opts?: { chainId?: number; rpcUrl?: string }
): Promise<TokenGateState> => {
  if (!isAddress(walletAddress)) {
    throw new Error("Invalid wallet address");
  }

  const chain =
    opts && (opts.chainId != null || opts.rpcUrl) ? selectChainWithRpc(opts.chainId, opts.rpcUrl) : getPrimaryChain();

  const requirements = await buildRequirements(chain);
  const tokenReq = requirements[0];
  const nftReq = requirements[1];

  const decimals = await getTokenDecimals(chain);
  const minTokenBalanceWei =
    tokenReq.minTokenBalance && tokenReq.minTokenBalance !== "0"
      ? BigInt(tokenReq.minTokenBalance)
      : parseUnits("0", decimals);

  const tokenOk =
    tokenReq.minTokenBalance === "0" ? false : await hasTokenBalance(walletAddress, minTokenBalanceWei, chain);
  const nftOk = await hasPremiumPass(walletAddress, chain);

  const satisfied: TokenGateRequirement[] = [];
  const missing: TokenGateRequirement[] = [];

  if (tokenOk) satisfied.push(tokenReq);
  else missing.push(tokenReq);

  if (nftOk) satisfied.push(nftReq);
  else missing.push(nftReq);

  const eligible = tokenOk || nftOk;

  return {
    walletAddress,
    chainId: chain.id,
    eligible,
    satisfied,
    missing,
    checkedAt: Date.now()
  };
};
