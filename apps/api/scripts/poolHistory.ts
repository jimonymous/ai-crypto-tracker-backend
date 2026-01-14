import { Contract, JsonRpcProvider, Log, getAddress } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config";
import { getDexChain } from "../src/dex/config";

// ---------- ABIs ----------
const V2_FACTORY_ABI = [
  "event PairCreated(address indexed token0,address indexed token1,address pair,uint256)",
  "function getPair(address tokenA,address tokenB) view returns (address)"
];

const V3_FACTORY_ABI = [
  "event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)",
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address)"
];

const V2_SWAP_ABI = [
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)"
];
const V3_SWAP_ABI = [
  "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)"
];

export type DexKind = "v2" | "v3";
export type CreationInfo = { kind: DexKind; address: string; creationBlock: number; fee?: number };
export type FirstSwap = { abi: DexKind; firstSwapBlock: number; firstSwapTimestamp: number } | null;

const sort2 = (a: string, b: string): [string, string] =>
  a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];

const getBlockTimestamp = async (provider: JsonRpcProvider, blockNumber: number) => {
  const b = await provider.getBlock(blockNumber);
  if (!b) throw new Error(`Block not found: ${blockNumber}`);
  return Number(b.timestamp);
};

const findFirstLogBlock = (logs: Log[]): number => {
  if (!logs.length) throw new Error("No logs");
  return logs.reduce((min, l) => (l.blockNumber < min ? l.blockNumber : min), logs[0].blockNumber);
};

export async function findV2Creation(params: {
  provider: JsonRpcProvider;
  factory: string;
  tokenA: string;
  tokenB: string;
  fromBlock: number;
  toBlock: number;
}): Promise<CreationInfo> {
  const { provider, factory, tokenA, tokenB, fromBlock, toBlock } = params;
  const c = new Contract(factory, V2_FACTORY_ABI, provider);
  const [t0, t1] = sort2(getAddress(tokenA), getAddress(tokenB));
  const logs = await c.queryFilter(c.filters.PairCreated(t0, t1), fromBlock, toBlock);
  if (!logs.length) throw new Error(`PairCreated not found for ${t0}/${t1}`);
  const creationBlock = findFirstLogBlock(logs);
  const address: string = await c.getPair(tokenA, tokenB);
  return { kind: "v2", address, creationBlock };
}

export async function findV3Creation(params: {
  provider: JsonRpcProvider;
  factory: string;
  tokenA: string;
  tokenB: string;
  fee: number;
  fromBlock: number;
  toBlock: number;
}): Promise<CreationInfo> {
  const { provider, factory, tokenA, tokenB, fee, fromBlock, toBlock } = params;
  const c = new Contract(factory, V3_FACTORY_ABI, provider);
  const [t0, t1] = sort2(getAddress(tokenA), getAddress(tokenB));
  const logs = await c.queryFilter(c.filters.PoolCreated(t0, t1, fee), fromBlock, toBlock);
  if (!logs.length) throw new Error(`PoolCreated not found for ${t0}/${t1} fee=${fee}`);
  const creationBlock = findFirstLogBlock(logs);
  const address: string = await c.getPool(tokenA, tokenB, fee);
  return { kind: "v3", address, creationBlock, fee };
}

export async function findFirstSwap(params: {
  provider: JsonRpcProvider;
  pool: string;
  creationBlock: number;
  latestBlock: number;
  preferAbi?: DexKind;
}): Promise<FirstSwap> {
  const { provider, pool, creationBlock, latestBlock, preferAbi } = params;
  const candidates =
    preferAbi === "v3"
      ? [
          { abi: "v3" as const, def: V3_SWAP_ABI },
          { abi: "v2" as const, def: V2_SWAP_ABI }
        ]
      : [
          { abi: "v2" as const, def: V2_SWAP_ABI },
          { abi: "v3" as const, def: V3_SWAP_ABI }
        ];

  for (const cand of candidates) {
    const c = new Contract(pool, cand.def, provider);
    const filter = c.filters.Swap();

    // quick existence check
    try {
      const any = await c.queryFilter(filter, creationBlock, latestBlock);
      if (!any.length) continue;
    } catch {
      continue;
    }

    // binary search
    let lo = creationBlock;
    let hi = latestBlock;
    let best: number | null = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      try {
        const logs = await c.queryFilter(filter, creationBlock, mid);
        if (logs.length) {
          best = mid;
          hi = mid - 1;
        } else {
          lo = mid + 1;
        }
      } catch {
        hi = mid - 1;
      }
    }
    if (best == null) continue;
    const ts = await getBlockTimestamp(provider, best);
    return { abi: cand.abi, firstSwapBlock: best, firstSwapTimestamp: ts };
  }
  return null;
}

type FactoryMeta = {
  kind: DexKind;
  factory: string;
  fromBlock: number;
  preferAbi?: DexKind;
  fee?: number;
};

export async function getPoolHistoryV2(params: {
  provider: JsonRpcProvider;
  factory: string;
  tokenA: string;
  tokenB: string;
  factoryFromBlock?: number;
  factoryToBlock?: number;
}): Promise<{ creation: CreationInfo; firstSwap: FirstSwap }> {
  const latest = params.factoryToBlock ?? (await params.provider.getBlockNumber());
  const creation = await findV2Creation({
    provider: params.provider,
    factory: params.factory,
    tokenA: params.tokenA,
    tokenB: params.tokenB,
    fromBlock: params.factoryFromBlock ?? 1,
    toBlock: latest
  });
  const firstSwap = await findFirstSwap({
    provider: params.provider,
    pool: creation.address,
    creationBlock: creation.creationBlock,
    latestBlock: latest,
    preferAbi: "v2"
  });
  return { creation, firstSwap };
}

export async function getPoolHistoryV3(params: {
  provider: JsonRpcProvider;
  factory: string;
  tokenA: string;
  tokenB: string;
  fee: number;
  factoryFromBlock?: number;
  factoryToBlock?: number;
}): Promise<{ creation: CreationInfo; firstSwap: FirstSwap }> {
  const latest = params.factoryToBlock ?? (await params.provider.getBlockNumber());
  const creation = await findV3Creation({
    provider: params.provider,
    factory: params.factory,
    tokenA: params.tokenA,
    tokenB: params.tokenB,
    fee: params.fee,
    fromBlock: params.factoryFromBlock ?? 1,
    toBlock: latest
  });
  const firstSwap = await findFirstSwap({
    provider: params.provider,
    pool: creation.address,
    creationBlock: creation.creationBlock,
    latestBlock: latest,
    preferAbi: "v3"
  });
  return { creation, firstSwap };
}

const FACTORY_DEPLOY_BLOCKS: Record<string, FactoryMeta> = {
  UNISWAP_V2_ETH: { kind: "v2", factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", fromBlock: 10000835 },
  SUSHISWAP_V2_ETH: { kind: "v2", factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac", fromBlock: 10794229 },
  UNISWAP_V3_ETH: { kind: "v3", factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984", fromBlock: 12369621, preferAbi: "v3" },
  PANCAKESWAP_V2_BSC: { kind: "v2", factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", fromBlock: 6800000 },
  QUICKSWAP_V2_POLYGON: { kind: "v2", factory: "0x5757371414417b8c6caad45baef941abc7d3ab32", fromBlock: 10000000 },
  TRADERJOE_V1_AVAX: { kind: "v2", factory: "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10", fromBlock: 12000000 },
  CAMELOT_V2_ARB: { kind: "v2", factory: "0x6EcCab422D763aC031210895C81787E87B43A652", fromBlock: 3500000 },
  AERODROME_BASE: { kind: "v2", factory: "0x420dd381b31aEf6683db6B902084cB0FFeCe40Da", fromBlock: 0, preferAbi: "v2" },
  VELODROME_OP: { kind: "v2", factory: "0x25cbdDb98b35aB1FF77413456B31EC81A6B6B746", fromBlock: 0, preferAbi: "v2" }
};

async function main() {
  const outPath = path.join(process.cwd(), "apps/api/discovered_pools_history.json");
  const detailed: any[] = [];

  for (const [name, meta] of Object.entries(FACTORY_DEPLOY_BLOCKS)) {
    const chainName = name.includes("BSC")
      ? "bsc"
      : name.includes("POLYGON")
      ? "polygon"
      : name.includes("AVAX")
      ? "avalanche"
      : name.includes("ARB")
      ? "arbitrum"
      : name.includes("BASE")
      ? "base"
      : name.includes("OP")
      ? "optimism"
      : "ethereum";
    const chain = getDexChain(
      ["bsc", "polygon", "avalanche", "arbitrum", "base", "optimism"].includes(chainName) ? undefined : 1
    );
    const rpc =
      chainName === "bsc"
        ? config.BSC_MAINNET_RPC
        : chainName === "polygon"
        ? config.POLYGON_MAINNET_RPC
        : chainName === "avalanche"
        ? config.AVALANCHE_MAINNET_RPC
        : chainName === "arbitrum"
        ? config.ARBITRUM_MAINNET_RPC
        : chainName === "base"
        ? config.BASE_MAINNET_RPC
        : chainName === "optimism"
        ? config.OPTIMISM_MAINNET_RPC
        : config.ETH_MAINNET_RPC || config.CHAIN_RPC_URL;
    if (!rpc) {
      console.warn(`Skipping ${name}: missing RPC`);
      continue;
    }
    const provider = new JsonRpcProvider(rpc);
    const poolsPath = path.join(process.cwd(), "apps/api/discovered_pools.json");
    const raw = JSON.parse(fs.readFileSync(poolsPath, "utf-8"));
    const dexPools = raw.results[name];
    if (!dexPools) continue;
    const latest = await provider.getBlockNumber();

    const push = async (pairKey: string, poolAddr: string, fee?: number) => {
      try {
        const [a, b] = pairKey.split("/");
        let creation: CreationInfo;
        if (meta.kind === "v2") {
          creation = await findV2Creation({
            provider,
            factory: meta.factory,
            tokenA: a,
            tokenB: b,
            fromBlock: meta.fromBlock,
            toBlock: latest
          });
        } else {
          creation = await findV3Creation({
            provider,
            factory: meta.factory,
            tokenA: a,
            tokenB: b,
            fee: fee ?? 3000,
            fromBlock: meta.fromBlock,
            toBlock: latest
          });
        }
        const firstSwap = await findFirstSwap({
          provider,
          pool: poolAddr,
          creationBlock: creation.creationBlock,
          latestBlock: latest,
          preferAbi: meta.preferAbi
        });
        detailed.push({
          dex: name,
          chain: chainName,
          token0: a,
          token1: b,
          fee,
          address: poolAddr,
          creationBlock: creation.creationBlock,
          firstSwapBlock: firstSwap?.firstSwapBlock ?? null,
          firstSwapTimestamp: firstSwap?.firstSwapTimestamp ?? null
        });
      } catch (err) {
        console.warn(`history failed for ${name} ${pairKey} fee=${fee}: ${(err as Error).message}`);
      }
    };

    for (const [pairKey, pools] of Object.entries(dexPools)) {
      if (typeof pools === "string") {
        await push(pairKey, pools as string);
      } else {
        for (const [fee, poolAddr] of Object.entries(pools as any)) {
          await push(pairKey, poolAddr as string, Number(fee));
        }
      }
    }
  }

  fs.writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), detailed }, null, 2));
  console.log(`Wrote ${outPath} with ${detailed.length} entries`);
}

if (process.env.VITEST !== "true") {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
