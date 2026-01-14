import { parseUnits } from "viem";
import { prisma } from "../db";
import { ChainConfig, getPrimaryChain } from "../chain/config";
import { makePublicClient } from "../chain/publicClient";
import { config } from "../config";

const pricePerPeriodWei = (chain: ChainConfig) => parseUnits(config.ACT_PRICE_PER_CALL, chain.token.decimals);
const accessPeriodMs = () => config.ACT_ACCESS_PERIOD_MINUTES * 60 * 1000;

export const getPriceInfo = (chain: ChainConfig = getPrimaryChain()) => {
  const wei = pricePerPeriodWei(chain);
  return {
    token: process.env.REWARD_TOKEN_SYMBOL || "ACT",
    amount: config.ACT_PRICE_PER_CALL,
    amountWei: wei.toString(),
    decimals: chain.token.decimals,
    tokenAddress: chain.token.address,
    periodMinutes: config.ACT_ACCESS_PERIOD_MINUTES
  };
};

export const getActivePass = async (userId: string, walletAddress: string) => {
  return prisma.apiAccessPass.findFirst({
    where: {
      userId,
      walletAddress,
      expiresAt: {
        gt: new Date()
      }
    },
    orderBy: { expiresAt: "desc" }
  });
};

const hasSufficientBalance = async (walletAddress: string, amountWei: bigint, chain: ChainConfig) => {
  const client = makePublicClient(chain);
  const balance = await client.readContract({
    address: chain.token.address as `0x${string}`,
    abi: chain.token.abi,
    functionName: "balanceOf",
    args: [walletAddress as `0x${string}`]
  });
  return { balance, ok: balance >= amountWei };
};

export const ensureActiveAccess = async (userId: string, walletAddress: string, chain: ChainConfig = getPrimaryChain()) => {
  const active = await getActivePass(userId, walletAddress);
  if (active) return active;

  const price = pricePerPeriodWei(chain);
  const { ok, balance } = await hasSufficientBalance(walletAddress, price, chain);
  if (!ok) {
    const info = getPriceInfo(chain);
    throw Object.assign(new Error("INSUFFICIENT_ACT_BALANCE"), {
      statusCode: 402,
      requiredWei: price.toString(),
      balanceWei: balance.toString(),
      tokenAddress: info.tokenAddress,
      tokenSymbol: info.token,
      periodMinutes: info.periodMinutes
    });
  }

  const expiresAt = new Date(Date.now() + accessPeriodMs());
  const pass = await prisma.apiAccessPass.create({
    data: {
      userId,
      walletAddress,
      tokenAddress: chain.token.address,
      priceWei: price.toString(),
      tokenSymbol: process.env.REWARD_TOKEN_SYMBOL || "ACT",
      periodMinutes: config.ACT_ACCESS_PERIOD_MINUTES,
      expiresAt
    }
  });

  return pass;
};
