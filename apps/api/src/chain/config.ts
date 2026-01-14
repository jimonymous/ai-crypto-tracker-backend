import fs from "fs";
import path from "path";
import { config } from "../config";
import { tokenAbi, premiumPassAbi, rewardsMerkleAbi, feeTreasuryAbi, stakingAbi, governanceAbi } from "./abis";

export type ChainDeployment = {
  network: string;
  chainId: string;
  contracts: {
    token?: { address: string };
    premiumPass?: { address: string };
    rewardsMerkle?: { address: string; token?: string };
    feeTreasury?: { address: string };
    staking?: { address: string };
    governance?: { address: string };
  };
};

export type ChainConfig = {
  id: number;
  chainId: number;
  name: string;
  rpcUrl: string;
  token: {
    address: string;
    abi: typeof tokenAbi;
    decimals: number;
    minBalance: string;
  };
  premiumPass: {
    address: string;
    abi: typeof premiumPassAbi;
  };
  rewards: {
    address: string;
    abi: typeof rewardsMerkleAbi;
  };
  treasury: string;
  staking?: { address: string; abi: typeof stakingAbi };
  governance?: { address: string; abi: typeof governanceAbi };
  deploymentName?: string;
  deployment: ChainDeployment | null;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const loadDeployment = (chainDeploymentName: string): ChainDeployment | null => {
  const filePath = path.resolve(
    __dirname,
    "../../../chain/deployments",
    `${chainDeploymentName}.json`
  );

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ChainDeployment;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[chain] failed to read deployment file", err);
    return null;
  }
};

const parseMultichain = (): ChainConfig[] => {
  try {
    const parsed = JSON.parse(config.MULTICHAIN_JSON) as any[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c) => {
      const deploymentName = c.deployment || config.CHAIN_DEPLOYMENT;
      const deployment = loadDeployment(deploymentName);
      const id = Number(c.id);
      return {
        id,
        chainId: id,
        name: c.name || `chain-${c.id}`,
        rpcUrl: c.rpcUrl,
        token: {
          address: c.tokenAddress,
          abi: tokenAbi,
          decimals: c.decimals ?? config.TOKEN_DECIMALS,
          minBalance: c.minBalance ?? "0"
        },
        premiumPass: {
          address: c.premiumPassAddress,
          abi: premiumPassAbi
        },
        rewards: {
          address: c.rewardsAddress,
          abi: rewardsMerkleAbi
        },
        treasury: c.treasuryAddress ?? config.ACT_TREASURY_ADDRESS,
        staking: { address: c.stakingAddress ?? ZERO_ADDRESS, abi: stakingAbi },
        governance: { address: c.governanceAddress ?? ZERO_ADDRESS, abi: governanceAbi },
        deploymentName,
        deployment
      };
    });
  } catch {
    return [];
  }
};

const singleDeployment = loadDeployment(config.CHAIN_DEPLOYMENT);

const defaultChain: ChainConfig = {
  id: config.CHAIN_ID,
  chainId: config.CHAIN_ID,
  name: `chain-${config.CHAIN_ID}`,
  rpcUrl: config.CHAIN_RPC_URL,
  token: {
    address: singleDeployment?.contracts.token?.address ?? config.TOKEN_ADDRESS,
    abi: tokenAbi,
    decimals: config.TOKEN_DECIMALS,
    minBalance: config.TOKEN_MIN_BALANCE
  },
  premiumPass: {
    address: singleDeployment?.contracts.premiumPass?.address ?? config.PREMIUM_PASS_ADDRESS,
    abi: premiumPassAbi
  },
  rewards: {
    address: singleDeployment?.contracts.rewardsMerkle?.address ?? config.REWARDS_CONTRACT_ADDRESS,
    abi: rewardsMerkleAbi
  },
  treasury: config.ACT_TREASURY_ADDRESS,
  staking: { address: singleDeployment?.contracts.staking?.address ?? ZERO_ADDRESS, abi: stakingAbi },
  governance: { address: singleDeployment?.contracts.governance?.address ?? ZERO_ADDRESS, abi: governanceAbi },
  deploymentName: config.CHAIN_DEPLOYMENT,
  deployment: singleDeployment
};

const multi = parseMultichain();

export const chains: ChainConfig[] = multi.length ? multi : [defaultChain];
const knownRpcEnvVars = [
  process.env.ETH_MAINNET_RPC,
  process.env.ETH_SEPOLIA_RPC,
  process.env.POLYGON_MAINNET_RPC,
  process.env.POLYGON_AMOY_RPC,
  process.env.BSC_MAINNET_RPC,
  process.env.ARBITRUM_MAINNET_RPC,
  process.env.OPTIMISM_MAINNET_RPC,
  process.env.AVALANCHE_MAINNET_RPC,
  process.env.BASE_MAINNET_RPC
];

const allowedRpcHostnames = new Set(
  [
    ...chains.map((chain) => chain.rpcUrl),
    ...knownRpcEnvVars
  ]
    .map((rpcUrl) => {
      if (!rpcUrl) return null;
      try {
        return new URL(rpcUrl).hostname.toLowerCase();
      } catch {
        return null;
      }
    })
    .filter(Boolean) as string[]
);

const hasUsableAddresses = (deployment: ChainDeployment | null) =>
  !!deployment &&
  deployment.contracts.token?.address &&
  deployment.contracts.token.address !== ZERO_ADDRESS &&
  deployment.contracts.premiumPass?.address &&
  deployment.contracts.premiumPass.address !== ZERO_ADDRESS &&
  deployment.contracts.rewardsMerkle?.address &&
  deployment.contracts.rewardsMerkle.address !== ZERO_ADDRESS &&
  deployment.contracts.feeTreasury?.address &&
  deployment.contracts.feeTreasury.address !== ZERO_ADDRESS;

const needsDeploymentRefresh = (chain: ChainConfig) =>
  !hasUsableAddresses(chain.deployment) ||
  chain.deployment?.chainId !== chain.id.toString() ||
  chain.token.address === ZERO_ADDRESS ||
  chain.premiumPass.address === ZERO_ADDRESS ||
  chain.rewards.address === ZERO_ADDRESS ||
  chain.treasury === ZERO_ADDRESS ||
  (process.env.CHAIN_DEPLOYMENT && process.env.CHAIN_DEPLOYMENT !== chain.deploymentName);

const DEPLOYMENTS_DIR = path.resolve(__dirname, "../../../chain/deployments");

const findDeploymentByChainId = (chainId: number): { deployment: ChainDeployment; name: string } | null => {
  if (!fs.existsSync(DEPLOYMENTS_DIR)) return null;
  const files = fs.readdirSync(DEPLOYMENTS_DIR).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const name = path.basename(file, ".json");
    const dep = loadDeployment(name);
    if (dep && dep.chainId === chainId.toString() && hasUsableAddresses(dep)) {
      return { deployment: dep, name };
    }
  }
  return null;
};

const hydrateDeployment = (chain: ChainConfig): ChainConfig => {
  const runtimeDeploymentName = process.env.CHAIN_DEPLOYMENT || chain.deploymentName || config.CHAIN_DEPLOYMENT;
  const candidateNames = Array.from(
    new Set(
      [
        runtimeDeploymentName,
        chain.deploymentName,
        config.CHAIN_DEPLOYMENT,
        chain.id === 31337 ? "localhost" : undefined,
        chain.id === 31337 ? "hardhat" : undefined
      ].filter(Boolean)
    )
  ) as string[];

  let selected: { deployment: ChainDeployment; name: string } | null = null;
  for (const name of candidateNames) {
    const dep = name ? loadDeployment(name) : null;
    if (!dep || dep.chainId !== chain.id.toString()) continue;
    if (!hasUsableAddresses(dep)) continue;
    selected = { deployment: dep, name };
    break;
  }

  if (!selected) {
    const found = findDeploymentByChainId(chain.id);
    if (found) {
      selected = found;
    }
  }

  if (!selected) return chain;

  const { deployment, name } = selected;
  chain.deploymentName = name;
  chain.deployment = deployment;
  chain.token.address = deployment.contracts.token?.address ?? chain.token.address;
  chain.premiumPass.address = deployment.contracts.premiumPass?.address ?? chain.premiumPass.address;
  chain.rewards.address = deployment.contracts.rewardsMerkle?.address ?? chain.rewards.address;
  chain.treasury = deployment.contracts.feeTreasury?.address ?? chain.treasury;
  chain.staking = { address: deployment.contracts.staking?.address ?? chain.staking?.address ?? ZERO_ADDRESS, abi: stakingAbi };
  chain.governance = { address: deployment.contracts.governance?.address ?? chain.governance?.address ?? ZERO_ADDRESS, abi: governanceAbi };

  return chain;
};

const ensureDeployment = (chain: ChainConfig): ChainConfig => hydrateDeployment(chain);

export const getChainById = (id: number): ChainConfig | undefined => {
  const found = chains.find((c) => c.id === id);
  return found ? ensureDeployment(found) : undefined;
};

export const getPrimaryChain = (): ChainConfig => ensureDeployment(chains[0]);

export const chainConfig = getPrimaryChain();

export const selectChain = (chainId?: number): ChainConfig => {
  if (chainId == null) return getPrimaryChain();
  const found = getChainById(chainId);
  return found ?? getPrimaryChain();
};

const sanitizeRpcUrl = (rpcUrl?: string) => {
  if (!rpcUrl) return undefined;
  try {
    const parsed = new URL(rpcUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    const hostname = parsed.hostname.toLowerCase();
    if (allowedRpcHostnames.size && !allowedRpcHostnames.has(hostname)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
};

export const selectChainWithRpc = (chainId?: number, rpcUrl?: string): ChainConfig => {
  const base = selectChain(chainId);
  const cleanRpc = sanitizeRpcUrl(rpcUrl);
  if (!cleanRpc) return base;
  return {
    ...base,
    rpcUrl: cleanRpc
  };
};
