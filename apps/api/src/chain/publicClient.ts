import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ChainConfig, getPrimaryChain } from "./config";

export const buildChain = (cfg: ChainConfig) =>
  ({
    id: cfg.id,
    name: cfg.name,
    network: cfg.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [cfg.rpcUrl] },
      public: { http: [cfg.rpcUrl] }
    }
  } as const);

export const makePublicClient = (cfg: ChainConfig) =>
  createPublicClient({
    chain: buildChain(cfg),
    transport: http(cfg.rpcUrl)
  });

export const makeWalletClient = (cfg: ChainConfig) => {
  if (!process.env.CHAIN_PRIVATE_KEY) return null;
  const account = privateKeyToAccount(process.env.CHAIN_PRIVATE_KEY as `0x${string}`);
  return createWalletClient({
    account,
    chain: buildChain(cfg),
    transport: http(cfg.rpcUrl)
  });
};

// Defaults to primary chain for existing usage
const primary = getPrimaryChain();
export const publicClient = makePublicClient(primary);
export const walletClient = makeWalletClient(primary);
