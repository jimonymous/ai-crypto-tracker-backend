import "dotenv/config";
import { Contract, JsonRpcProvider, getAddress, isAddress } from "ethers";
import fs from "node:fs";
import path from "node:path";

/**
 * Discover top pool addresses per DEX/chain for allowlisting.
 * Usage (WSL): ETH_MAINNET_RPC=... POLYGON_MAINNET_RPC=... npm run tsx scripts/discoverPools.ts
 */

const ZERO = "0x0000000000000000000000000000000000000000";

const V2_FACTORY_ABI = ["function getPair(address tokenA, address tokenB) view returns (address pair)"];
const V3_FACTORY_ABI = ["function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)"];
const SOLIDLY_FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, bool stable) view returns (address)",
  "function getPair(address tokenA, address tokenB, bool stable) view returns (address)"
];
const V2_POOL_ABI = ["function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)"];
const V3_POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function liquidity() view returns (uint128)"
];
const SOLIDLY_POOL_ABI = V2_POOL_ABI;
const SWAP_TOPIC = {
  "uniswap-v2": "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // Swap(address,uint256,uint256,uint256,uint256,address)
  "uniswap-v3": "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67", // Swap(address,address,int256,int256,uint160,uint128,int24)
  solidly: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822" // reuse v2 sig
};

function addr(x: string): string {
  const clean = x.trim();
  if (isAddress(clean)) return getAddress(clean);
  if (/^0x[0-9a-fA-F]{40}$/.test(clean)) return String(clean).toLowerCase();
  throw new Error(`Invalid address: ${x}`);
}
const norm = (x: string): string => String(addr(x)).toLowerCase();
const requireEnv = (n: string) => {
  const v = process.env[n];
  if (!v) throw new Error(`Missing env var: ${n}`);
  return v;
};
const optionalEnv = (n: string) => process.env[n] || "";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function uniqPairs(pairs: [string, string][]) {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const [a, b] of pairs) {
    const key = [norm(a), norm(b)].sort().join("-");
    if (!seen.has(key)) {
      seen.add(key);
      out.push([addr(a), addr(b)]);
    }
  }
  return out;
}

async function discoverV2Pairs({
  provider,
  factory,
  pairs,
  delayMs = 150
}: {
  provider: JsonRpcProvider;
  factory: string;
  pairs: [string, string][];
  delayMs?: number;
}) {
  const c = new Contract(addr(factory), V2_FACTORY_ABI, provider);
  const res: Record<string, string> = {};
  for (const [a, b] of uniqPairs(pairs)) {
    const pair = addr(await c.getPair(a, b));
    if (pair !== ZERO) res[`${a}/${b}`] = pair;
    if (delayMs > 0) await sleep(delayMs);
  }
  return res;
}

async function discoverV3Pools({
  provider,
  factory,
  pairs,
  fees,
  delayMs = 150
}: {
  provider: JsonRpcProvider;
  factory: string;
  pairs: [string, string][];
  fees: number[];
  delayMs?: number;
}) {
  const c = new Contract(addr(factory), V3_FACTORY_ABI, provider);
  const res: Record<string, Record<string, string>> = {};
  for (const [a, b] of uniqPairs(pairs)) {
    const perFee: Record<string, string> = {};
    for (const fee of fees) {
      let pool = ZERO;
      try {
        pool = addr(await c.getPool(a, b, fee));
      } catch {
        pool = ZERO;
      }
      if (pool !== ZERO) perFee[String(fee)] = pool;
      if (delayMs > 0) await sleep(delayMs);
    }
    res[`${a}/${b}`] = perFee;
    if (delayMs > 0) await sleep(delayMs);
  }
  return res;
}

async function trySolidlyCall(c: Contract, method: string, args: any[]) {
  try {
    const r = await c[method](...args);
    return addr(r);
  } catch {
    return null;
  }
}

async function discoverSolidlyPools({
  provider,
  factory,
  pairs,
  stableSelector,
  delayMs = 150
}: {
  provider: JsonRpcProvider;
  factory: string;
  pairs: [string, string][];
  stableSelector: (a: string, b: string) => boolean;
  delayMs?: number;
}) {
  const c = new Contract(addr(factory), SOLIDLY_FACTORY_ABI, provider);
  const res: Record<
    string,
    {
      stable_guess: boolean;
      stable: string;
      volatile: string;
    }
  > = {};
  for (const [a, b] of uniqPairs(pairs)) {
    const stable = !!stableSelector(a, b);
    const stablePool =
      (await trySolidlyCall(c, "getPool", [a, b, true])) ??
      (await trySolidlyCall(c, "getPair", [a, b, true])) ??
      ZERO;
    const volatilePool =
      (await trySolidlyCall(c, "getPool", [a, b, false])) ??
      (await trySolidlyCall(c, "getPair", [a, b, false])) ??
      ZERO;
    res[`${a}/${b}`] = { stable_guess: stable, stable: stablePool, volatile: volatilePool };
    if (delayMs > 0) await sleep(delayMs);
  }
  return res;
}

async function hasLiveLiquidity({
  provider,
  pool,
  kind
}: {
  provider: JsonRpcProvider;
  pool: string;
  kind: "uniswap-v2" | "uniswap-v3" | "solidly";
}) {
  const address = addr(pool);
  try {
    if (kind === "uniswap-v2" || kind === "solidly") {
      const c = new Contract(address, SOLIDLY_POOL_ABI, provider);
      const [r0, r1] = await c.getReserves();
      return BigInt(r0) > 0n && BigInt(r1) > 0n;
    }
    if (kind === "uniswap-v3") {
      const c = new Contract(address, V3_POOL_ABI, provider);
      const liq = await c.liquidity();
      return BigInt(liq) > 0n;
    }
  } catch {
    return false;
  }
  return false;
}

async function hasRecentSwaps({
  provider,
  pool,
  kind,
  minSwaps = 25
}: {
  provider: JsonRpcProvider;
  pool: string;
  kind: "uniswap-v2" | "uniswap-v3" | "solidly";
  minSwaps?: number;
}) {
  const topic = SWAP_TOPIC[kind];
  if (!topic) return false;
  try {
    const latest = await provider.getBlock("latest");
    const prev = await provider.getBlock(latest.number - 1);
    const avgSec = Math.max(1, Number(latest.timestamp - prev.timestamp));
    const blocksNeeded = Math.max(1000, Math.floor((minSwaps * 5 * 60) / avgSec)); // 25 swaps over ~5m buckets
    const fromBlock = latest.number - BigInt(blocksNeeded);
    const logs = await provider.getLogs({
      address: addr(pool),
      fromBlock,
      toBlock: latest.number,
      topics: [topic]
    });
    return logs.length >= minSwaps;
  } catch {
    return false;
  }
}

const providers = {
  ETHEREUM: new JsonRpcProvider(requireEnv("ETH_MAINNET_RPC")),
  POLYGON: new JsonRpcProvider(requireEnv("POLYGON_MAINNET_RPC")),
  BSC: new JsonRpcProvider(requireEnv("BSC_MAINNET_RPC")),
  ARBITRUM: new JsonRpcProvider(requireEnv("ARBITRUM_MAINNET_RPC")),
  OPTIMISM: new JsonRpcProvider(requireEnv("OPTIMISM_MAINNET_RPC")),
  AVALANCHE: new JsonRpcProvider(requireEnv("AVALANCHE_MAINNET_RPC")),
  BASE: new JsonRpcProvider(requireEnv("BASE_MAINNET_RPC")),
  ETH_SEPOLIA: optionalEnv("ETH_SEPOLIA_RPC") ? new JsonRpcProvider(process.env.ETH_SEPOLIA_RPC!) : null,
  POLYGON_AMOY: optionalEnv("POLYGON_AMOY_RPC")
    ? new JsonRpcProvider(process.env.POLYGON_AMOY_RPC!)
    : null
};

const DEX = {
  UNISWAP_V2: { chain: "ETHEREUM", kind: "v2", factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f" },
  SUSHISWAP_V2_ETH: { chain: "ETHEREUM", kind: "v2", factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac" },
  UNISWAP_V3_ETH: {
    chain: "ETHEREUM",
    kind: "v3",
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    fees: [100, 500, 3000, 10000]
  },
  PANCAKESWAP_V2_BSC: { chain: "BSC", kind: "v2", factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73" },
  QUICKSWAP_V2_POLYGON: { chain: "POLYGON", kind: "v2", factory: "0x5757371414417b8c6caad45baef941abc7d3ab32" },
  AERODROME_BASE: { chain: "BASE", kind: "solidly", factory: "0x420dd381b31aEf6683db6B902084cB0FFeCe40Da" },
  VELODROME_OP: { chain: "OPTIMISM", kind: "solidly", factory: "0x25cbdDb98b35aB1FF77413456B31EC81A6B6B746" },
  TRADERJOE_V1_AVAX: { chain: "AVALANCHE", kind: "v2", factory: "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10" },
  CAMELOT_V2_ARB: { chain: "ARBITRUM", kind: "v2", factory: "0x6EcCab422D763aC031210895C81787E87B43A652" },
  // Uni v2 factories per chain (latest deployment matrix)
  UNISWAP_V2_ARBITRUM: { chain: "ARBITRUM", kind: "v2", factory: "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9" },
  UNISWAP_V2_AVALANCHE: { chain: "AVALANCHE", kind: "v2", factory: "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C" },
  UNISWAP_V2_BSC: { chain: "BSC", kind: "v2", factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6" },
  UNISWAP_V2_BASE: { chain: "BASE", kind: "v2", factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6" },
  UNISWAP_V2_OPTIMISM: { chain: "OPTIMISM", kind: "v2", factory: "0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf" },
  UNISWAP_V2_POLYGON_ALT: { chain: "POLYGON", kind: "v2", factory: "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C" }
};

const ROUTERS = {
  UNISWAP_V2_ETH: {
    chain: "ETHEREUM",
    router02: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
  },
  UNISWAP_V3_ETH: {
    chain: "ETHEREUM",
    swapRouter02: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"
  },
  SUSHISWAP_V2_ETH: {
    chain: "ETHEREUM",
    router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"
  },
  PANCAKESWAP_V2_BSC: {
    chain: "BSC",
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E"
  },
  PANCAKESWAP_V3_BSC: {
    chain: "BSC",
    swapRouter: "0x1b81D678ffb9C0263b24A97847620C99d213eB14"
  },
  QUICKSWAP_V2_POLYGON: {
    chain: "POLYGON",
    router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"
  },
  TRADERJOE_V1_AVAX: {
    chain: "AVALANCHE",
    router: "0x60aE616a2155Ee3d9a68541Ba4544862310933d4"
  },
  CAMELOT_V2_ARB: {
    chain: "ARBITRUM",
    router: "0xc873fEcbd354f5A56E00E710B90EF4201db2448d"
  },
  CAMELOT_V3_ARB_ALGEBRA: {
    chain: "ARBITRUM",
    router: "0x1f721e2e82f6676fce4ea07a5958cf098d339e18"
  },
  VELODROME_OP: {
    chain: "OPTIMISM",
    router: "0x9c12939390052919aF3155f41Bf4160Fd3666A6f"
  },
  AERODROME_BASE: {
    chain: "BASE",
    router: "0xcf77a3BA9A5CA399B7c97c74d54e5b1BeB874E43"
  },
  UNISWAP_V2_ARBITRUM: { chain: "ARBITRUM", router: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24" },
  UNISWAP_V2_AVALANCHE: { chain: "AVALANCHE", router: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24" },
  UNISWAP_V2_BSC: { chain: "BSC", router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" },
  UNISWAP_V2_BASE: { chain: "BASE", router: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24" },
  UNISWAP_V2_OPTIMISM: { chain: "OPTIMISM", router: "0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2" },
  UNISWAP_V2_POLYGON_ALT: { chain: "POLYGON", router: "0xedf6066a2b290C185783862C7F4776A2C8077AD1" }
};

const TOKENS = {
  ETHEREUM: {
    WETH: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    LDO: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
    MKR: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
    AAVE: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DdAE9",
    SUSHI: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
    FRAX: "0x853d955aCEf822Db058eb8505911ED77F175b99e",
    COMP: "0xc00e94Cb662C3520282E6f5717214004A7f26888",
    SNX: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
    YFI: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e"
  },
  BSC: {
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    BUSD: "0xe9e7cea3dedca5984780bafc599bd69add087d56",
    USDT: "0x55d398326f99059ff775485246999027b3197955",
    CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    ETH: "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
    BTCB: "0x7130d2a12b9bcfaae4f2634d864a1ee1ce3ead9c",
    DAI: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3",
    ADA: "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47",
    XRP: "0x1D2F0da169ceB9Fc7A15C44dE1fE87d5F0eD5E9E",
    DOGE: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43",
    UNI: "0xBf5140A22578168FD562DCcF235E5D43A02ce9B1",
    LINK: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD",
    SXP: "0x47BEAd2563dCBf3b0B42e8cB6e1eE98Fbb9b30F5"
  },
  POLYGON: {
    WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    WBTC: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
    WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    LINK: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
    UNI: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f",
    AAVE: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
    DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    FRAX: "0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89",
    SUSHI: "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a",
    BAL: "0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3"
  },
  ARBITRUM: {
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    LINK: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
    UNI: "0xfa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
    AAVE: "0xba5DdD1f9d7F570dc94a51479a000E3BCE967196",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    FRAX: "0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F",
    SUSHI: "0xd4d42F0b6DEF4CE0383636770eF773390d85c61A",
    GMX: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
    SYN: "0x080F6AEd32Fc474DD5717105Dba5ea57268F46eb"
  },
  OPTIMISM: {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    USDT: "0x94b008aA00579c1307B0EF2c499Ad98a8ce58e58",
    WBTC: "0x68f180fcce6836688e9084f035309e29bf0a2095",
    OP: "0x4200000000000000000000000000000000000042",
    DAI: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
    LINK: "0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6",
    UNI: "0x6fd9d7AD17242c41f7131d257212c54A0e816691",
    AAVE: "0x76fb31fb4af56892a25e32cfc43de717950c9278",
    FRAX: "0x2e3d870790dc77a83dd1d18184acc7439a53f475",
    GMX: "0x3390108E913824B8eaD638444cc52B9aBdF63798",
    SYN: "0x5A5fF6E2f0A6A58d05b56bD68a8a68b5cE5bB6eD"
  },
  BASE: {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    WBTC: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
    DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    LINK: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
    UNI: "0x453Edb6f3B48cF6A2e4b7f21eC0A667f2bECd42D",
    AAVE: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
    FRAX: "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8",
    BAL: "0x4158734D47Fc9692176B5085E0F52ee0Da5d47F1",
    SUSHI: "0x7D49a065D17d6d4a55dc13649901fdBB98B2AFBA",
    CBETH: "0x2ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22"
  },
  AVALANCHE: {
    WAVAX: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    USDC: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    USDT: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    WBTC: "0x50b7545627a5162F82A992c33b87aDc75187B218",
    WETH: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
    DAI: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
    MIM: "0x130966628846BFd36ff31a822705796e8cb8C18D",
    PNG: "0x60781C2586D68229fde47564546784ab3fACA982",
    LINK: "0x5947BB275c521040051D82396192181b413227A3",
    SUSHI: "0x39cf1BD5f15fb22eC3D9Ff86b0727aFc203427cc",
    UNI: "0x8EBaf22B6F053dFFeaf46f4Dd9eFA95D89ba8580",
    AAVE: "0x63a72806098Bd3D9520cC43356dD78afe5D386D9"
  }
};

const FALLBACK_POOLS: Record<
  string,
  {
    address: string;
    token0: string;
    token1: string;
    kind: "uniswap-v2" | "uniswap-v3" | "algebra" | "solidly";
    feeTierBps?: number;
  }[]
> = {
  ethereum: [
    {
      // Uniswap v3 WETH/USDT 0.3% mainnet
      address: "0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36",
      token0: TOKENS.ETHEREUM.WETH,
      token1: TOKENS.ETHEREUM.USDT,
      kind: "uniswap-v3",
      feeTierBps: 3000
    }
  ]
};

const pairsFromSymbols = (chain: keyof typeof TOKENS, list: [string, string][]) => {
  const t = TOKENS[chain];
  if (!t) throw new Error(`No TOKENS for chain: ${chain}`);
  return list.map(([a, b]) => {
    if (!t[a as keyof typeof t] || !t[b as keyof typeof t]) {
      throw new Error(`Missing token in TOKENS.${chain}: ${a} or ${b}`);
    }
    return [t[a as keyof typeof t], t[b as keyof typeof t]] as [string, string];
  });
};

const PAIRS_UNI_V3_ETH = pairsFromSymbols("ETHEREUM", [
  ["WETH", "USDC"],
  ["WETH", "USDT"],
  ["WBTC", "WETH"],
  ["USDC", "USDT"],
  ["DAI", "USDC"],
  ["LINK", "WETH"],
  ["UNI", "WETH"],
  ["LDO", "WETH"],
  ["MKR", "WETH"],
  ["AAVE", "WETH"],
  ["SUSHI", "WETH"],
  ["FRAX", "USDC"]
]);

const PAIRS_UNI_V2_ETH = pairsFromSymbols("ETHEREUM", [
  ["WETH", "USDT"],
  ["WETH", "USDC"],
  ["UNI", "WETH"],
  ["DAI", "USDC"],
  ["USDT", "USDC"],
  ["COMP", "WETH"],
  ["AAVE", "WETH"],
  ["LINK", "WETH"],
  ["MKR", "WETH"],
  ["SNX", "WETH"],
  ["YFI", "WETH"],
  ["WBTC", "WETH"]
]);

const PAIRS_SUSHI_ETH = pairsFromSymbols("ETHEREUM", [
  ["WETH", "USDC"],
  ["WETH", "USDT"],
  ["USDC", "USDT"],
  ["WBTC", "WETH"],
  ["SUSHI", "WETH"],
  ["LINK", "WETH"],
  ["AAVE", "WETH"],
  ["DAI", "USDC"],
  ["UNI", "WETH"],
  ["MKR", "WETH"],
  ["FRAX", "USDC"],
  ["YFI", "WETH"]
]);

const PAIRS_PANCAKE_BSC = pairsFromSymbols("BSC", [
  ["WBNB", "BUSD"],
  ["BUSD", "USDT"],
  ["WBNB", "USDT"],
  ["CAKE", "WBNB"],
  ["ETH", "BUSD"],
  ["BTCB", "BUSD"],
  ["DAI", "BUSD"],
  ["ADA", "BUSD"],
  ["XRP", "BUSD"],
  ["DOGE", "BUSD"]
]);

const PAIRS_QUICK_POLYGON = pairsFromSymbols("POLYGON", [
  ["WETH", "USDC"],
  ["WETH", "USDT"],
  ["USDC", "USDT"],
  ["WBTC", "WETH"],
  ["WMATIC", "USDC"],
  ["LINK", "WETH"],
  ["AAVE", "WETH"],
  ["DAI", "USDC"],
  ["UNI", "WETH"],
  ["FRAX", "USDC"],
  ["SUSHI", "WETH"],
  ["BAL", "WETH"]
]);

const PAIRS_AERODROME_BASE = pairsFromSymbols("BASE", [
  ["WETH", "USDC"],
  ["WETH", "USDT"],
  ["USDC", "USDT"],
  ["WBTC", "WETH"],
  ["CBETH", "WETH"],
  ["DAI", "USDC"],
  ["UNI", "WETH"],
  ["LINK", "WETH"],
  ["SUSHI", "WETH"],
  ["FRAX", "USDC"],
  ["AAVE", "WETH"],
  ["BAL", "WETH"]
]);

const PAIRS_VELODROME_OP = pairsFromSymbols("OPTIMISM", [
  ["OP", "USDC"],
  ["WETH", "USDC"],
  ["WETH", "USDT"],
  ["USDC", "USDT"],
  ["WBTC", "WETH"],
  ["DAI", "USDC"],
  ["LINK", "WETH"],
  ["UNI", "WETH"],
  ["AAVE", "WETH"],
  ["FRAX", "USDC"],
  ["SYN", "WETH"],
  ["GMX", "WETH"]
]);

const PAIRS_TRADERJOE_AVAX = pairsFromSymbols("AVALANCHE", [
  ["WAVAX", "USDC"],
  ["WAVAX", "WETH"],
  ["WAVAX", "WBTC"],
  ["WAVAX", "USDT"],
  ["DAI", "USDC"],
  ["USDT", "USDC"],
  ["MIM", "USDC"],
  ["PNG", "WAVAX"],
  ["LINK", "WAVAX"],
  ["SUSHI", "WAVAX"],
  ["UNI", "WAVAX"],
  ["AAVE", "WAVAX"]
]);

const PAIRS_CAMELOT_V2_ARB = pairsFromSymbols("ARBITRUM", [
  ["WETH", "USDC"],
  ["WETH", "USDT"],
  ["WBTC", "WETH"],
  ["USDC", "USDT"],
  ["LINK", "WETH"],
  ["AAVE", "WETH"],
  ["UNI", "WETH"],
  ["FRAX", "USDC"],
  ["DAI", "USDC"],
  ["SUSHI", "WETH"],
  ["GMX", "WETH"],
  ["SYN", "WETH"]
]);

const makeStableSelector = (chain: keyof typeof TOKENS) => {
  const t = TOKENS[chain];
  const stables = new Set(
    Object.entries(t)
      .filter(([sym]) => ["USDC", "USDT", "DAI", "BUSD", "FRAX", "MIM"].includes(sym))
      .map(([, a]) => norm(a))
  );
  return (a: string, b: string) => stables.has(norm(a)) && stables.has(norm(b));
};

async function main() {
  const out: any = { generated_at: new Date().toISOString(), results: {}, routers: ROUTERS };
  const assertFactory = (cfg: any, name: string) => {
    if (!cfg.factory || cfg.factory === ZERO) {
      console.warn(`Skipping ${name}: factory not set`);
      return false;
    }
    return true;
  };

  if (assertFactory(DEX.UNISWAP_V3_ETH, "UNISWAP_V3_ETH")) {
    const p = providers[DEX.UNISWAP_V3_ETH.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.UNISWAP_V3_ETH = await discoverV3Pools({
      provider: p,
      factory: DEX.UNISWAP_V3_ETH.factory,
      pairs: PAIRS_UNI_V3_ETH,
      fees: DEX.UNISWAP_V3_ETH.fees
    });
  }

  if (assertFactory(DEX.UNISWAP_V2, "UNISWAP_V2")) {
    const p = providers[DEX.UNISWAP_V2.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.UNISWAP_V2_ETH = await discoverV2Pairs({
      provider: p,
      factory: DEX.UNISWAP_V2.factory,
      pairs: PAIRS_UNI_V2_ETH
    });
  }

  if (assertFactory(DEX.SUSHISWAP_V2_ETH, "SUSHISWAP_V2_ETH")) {
    const p = providers[DEX.SUSHISWAP_V2_ETH.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.SUSHISWAP_V2_ETH = await discoverV2Pairs({
      provider: p,
      factory: DEX.SUSHISWAP_V2_ETH.factory,
      pairs: PAIRS_SUSHI_ETH
    });
  }

  if (assertFactory(DEX.PANCAKESWAP_V2_BSC, "PANCAKESWAP_V2_BSC")) {
    const p = providers[DEX.PANCAKESWAP_V2_BSC.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.PANCAKESWAP_V2_BSC = await discoverV2Pairs({
      provider: p,
      factory: DEX.PANCAKESWAP_V2_BSC.factory,
      pairs: PAIRS_PANCAKE_BSC
    });
  }

  if (assertFactory(DEX.UNISWAP_V2_BSC, "UNISWAP_V2_BSC")) {
    const p = providers[DEX.UNISWAP_V2_BSC.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.UNISWAP_V2_BSC = await discoverV2Pairs({
      provider: p,
      factory: DEX.UNISWAP_V2_BSC.factory,
      pairs: PAIRS_PANCAKE_BSC
    });
  }

  if (assertFactory(DEX.QUICKSWAP_V2_POLYGON, "QUICKSWAP_V2_POLYGON")) {
    const p = providers[DEX.QUICKSWAP_V2_POLYGON.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.QUICKSWAP_V2_POLYGON = await discoverV2Pairs({
      provider: p,
      factory: DEX.QUICKSWAP_V2_POLYGON.factory,
      pairs: PAIRS_QUICK_POLYGON
    });
  }

  if (assertFactory(DEX.UNISWAP_V2_POLYGON_ALT, "UNISWAP_V2_POLYGON_ALT")) {
    const p = providers[DEX.UNISWAP_V2_POLYGON_ALT.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.UNISWAP_V2_POLYGON_ALT = await discoverV2Pairs({
      provider: p,
      factory: DEX.UNISWAP_V2_POLYGON_ALT.factory,
      pairs: PAIRS_QUICK_POLYGON
    });
  }

  if (assertFactory(DEX.AERODROME_BASE, "AERODROME_BASE")) {
    const p = providers[DEX.AERODROME_BASE.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.AERODROME_BASE = await discoverSolidlyPools({
      provider: p,
      factory: DEX.AERODROME_BASE.factory,
      pairs: PAIRS_AERODROME_BASE,
      stableSelector: makeStableSelector("BASE")
    });
  }

  if (assertFactory(DEX.VELODROME_OP, "VELODROME_OP")) {
    const p = providers[DEX.VELODROME_OP.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.VELODROME_OP = await discoverSolidlyPools({
      provider: p,
      factory: DEX.VELODROME_OP.factory,
      pairs: PAIRS_VELODROME_OP,
      stableSelector: makeStableSelector("OPTIMISM")
    });
  }

  if (assertFactory(DEX.TRADERJOE_V1_AVAX, "TRADERJOE_V1_AVAX")) {
    const p = providers[DEX.TRADERJOE_V1_AVAX.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.TRADERJOE_V1_AVAX = await discoverV2Pairs({
      provider: p,
      factory: DEX.TRADERJOE_V1_AVAX.factory,
      pairs: PAIRS_TRADERJOE_AVAX
    });
  }

  if (assertFactory(DEX.UNISWAP_V2_AVALANCHE, "UNISWAP_V2_AVALANCHE")) {
    const p = providers[DEX.UNISWAP_V2_AVALANCHE.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.UNISWAP_V2_AVALANCHE = await discoverV2Pairs({
      provider: p,
      factory: DEX.UNISWAP_V2_AVALANCHE.factory,
      pairs: PAIRS_TRADERJOE_AVAX
    });
  }

  if (assertFactory(DEX.CAMELOT_V2_ARB, "CAMELOT_V2_ARB")) {
    const p = providers[DEX.CAMELOT_V2_ARB.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.CAMELOT_V2_ARB = await discoverV2Pairs({
      provider: p,
      factory: DEX.CAMELOT_V2_ARB.factory,
      pairs: PAIRS_CAMELOT_V2_ARB
    });
  }

  if (assertFactory(DEX.UNISWAP_V2_ARBITRUM, "UNISWAP_V2_ARBITRUM")) {
    const p = providers[DEX.UNISWAP_V2_ARBITRUM.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.UNISWAP_V2_ARBITRUM = await discoverV2Pairs({
      provider: p,
      factory: DEX.UNISWAP_V2_ARBITRUM.factory,
      pairs: PAIRS_CAMELOT_V2_ARB
    });
  }

  if (assertFactory(DEX.UNISWAP_V2_OPTIMISM, "UNISWAP_V2_OPTIMISM")) {
    const p = providers[DEX.UNISWAP_V2_OPTIMISM.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.UNISWAP_V2_OPTIMISM = await discoverV2Pairs({
      provider: p,
      factory: DEX.UNISWAP_V2_OPTIMISM.factory,
      pairs: PAIRS_VELODROME_OP
    });
  }

  if (assertFactory(DEX.UNISWAP_V2_BASE, "UNISWAP_V2_BASE")) {
    const p = providers[DEX.UNISWAP_V2_BASE.chain as keyof typeof providers] as JsonRpcProvider;
    out.results.UNISWAP_V2_BASE = await discoverV2Pairs({
      provider: p,
      factory: DEX.UNISWAP_V2_BASE.factory,
      pairs: PAIRS_AERODROME_BASE
    });
  }

  const outDir = path.resolve(__dirname, "..");
  const discoveredPath = path.join(outDir, "discovered_pools.json");
  fs.writeFileSync(discoveredPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${discoveredPath}`);

  // Build an allowlist snapshot for syncing into config
  type AllowPool = {
    address: string;
    token0: string;
    token1: string;
    kind: "uniswap-v2" | "uniswap-v3" | "solidly" | "algebra";
    feeTierBps?: number;
    stableGuess?: boolean;
  };
  const dexMeta: Record<string, { chain: string; kind: "uniswap-v2" | "uniswap-v3" | "solidly" }> = {
    UNISWAP_V2: { chain: "ethereum", kind: "uniswap-v2" },
    SUSHISWAP_V2_ETH: { chain: "ethereum", kind: "uniswap-v2" },
    UNISWAP_V3_ETH: { chain: "ethereum", kind: "uniswap-v3" },
    PANCAKESWAP_V2_BSC: { chain: "bsc", kind: "uniswap-v2" },
    QUICKSWAP_V2_POLYGON: { chain: "polygon", kind: "uniswap-v2" },
    AERODROME_BASE: { chain: "base", kind: "solidly" },
    VELODROME_OP: { chain: "optimism", kind: "solidly" },
    TRADERJOE_V1_AVAX: { chain: "avalanche", kind: "uniswap-v2" },
    CAMELOT_V2_ARB: { chain: "arbitrum", kind: "uniswap-v2" }
  };

  let allow: Record<string, { tokens: string[]; pools: AllowPool[] }> = {};

  for (const [dexName, pools] of Object.entries(out.results)) {
    const meta = dexMeta[dexName];
    if (!meta) continue;
    const chainKey = meta.chain;
    allow[chainKey] = allow[chainKey] || { tokens: [], pools: [] };

    for (const [pairKey, val] of Object.entries(pools as any)) {
      const [a, b] = pairKey.split("/");
      allow[chainKey].tokens.push(a, b);

      if (meta.kind === "solidly") {
        const entry = val as { stable_guess: boolean; stable: string; volatile: string };
        if (entry.stable && entry.stable !== ZERO) {
          allow[chainKey].pools.push({
            address: entry.stable,
            token0: a,
            token1: b,
            kind: "solidly",
            stableGuess: true
          });
        }
        if (entry.volatile && entry.volatile !== ZERO) {
          allow[chainKey].pools.push({
            address: entry.volatile,
            token0: a,
            token1: b,
            kind: "solidly",
            stableGuess: false
          });
        }
      } else if (meta.kind === "uniswap-v2") {
        if (typeof val === "string" && val !== ZERO) {
          allow[chainKey].pools.push({
            address: val,
            token0: a,
            token1: b,
            kind: "uniswap-v2"
          });
        }
      } else if (meta.kind === "uniswap-v3") {
        const fees = val as Record<string, string>;
        for (const [fee, addr] of Object.entries(fees)) {
          if (addr === ZERO) continue;
          allow[chainKey].pools.push({
            address: addr,
            token0: a,
            token1: b,
            feeTierBps: Number(fee),
            kind: "uniswap-v3"
          });
        }
      }
    }
  }

  // dedupe tokens per chain
  for (const chain of Object.keys(allow)) {
    const uniq = Array.from(new Set(allow[chain].tokens.map((t) => t.toLowerCase()))).map((t) => t);
    allow[chain].tokens = uniq;
  }

  // Prune pools that have no live liquidity to avoid scheduling empty markets
  for (const [chainKey, payload] of Object.entries(allow)) {
  const provider = providers[chainKey.toUpperCase() as keyof typeof providers] as JsonRpcProvider | null;
  if (!provider || !payload.pools?.length) continue;
  const kept: typeof payload.pools = [];
  for (const pool of payload.pools) {
    const liquid = await hasLiveLiquidity({ provider, pool: pool.address, kind: pool.kind });
    if (liquid) kept.push(pool);
  }
  allow[chainKey].pools = kept;
}

  // Cap total pools to 60 across all chains (keep current order)
  const MAX_POOLS = 60;
  const flattened: { chain: string; pool: any }[] = [];
  for (const [chain, payload] of Object.entries(allow)) {
    for (const p of payload.pools || []) {
      flattened.push({ chain, pool: p });
    }
  }
  const capped = flattened.slice(0, MAX_POOLS);
  if (flattened.length > capped.length) {
    const newAllow: typeof allow = {};
    for (const { chain, pool } of capped) {
      newAllow[chain] = newAllow[chain] || { tokens: [], pools: [] };
      newAllow[chain].pools.push(pool);
      newAllow[chain].tokens.push(pool.token0, pool.token1);
    }
    for (const [chain, payload] of Object.entries(newAllow)) {
      payload.tokens = Array.from(new Set(payload.tokens.map((t) => t.toLowerCase())));
    }
    allow = newAllow;
    // eslint-disable-next-line no-console
    console.log(`[discoverPools] capped pools at ${MAX_POOLS}; dropped ${flattened.length - capped.length} pools`);
  }

  const allowlistPath = path.join(outDir, "allowlist.generated.json");
  fs.writeFileSync(allowlistPath, JSON.stringify({ generated_at: new Date().toISOString(), allow }, null, 2));
  console.log(`Wrote ${allowlistPath} (tokens+pools per chain)`);

  // Emit a TS helper for pools to auto-sync config (pools only; tokens remain manual for decimals)
  const poolsByChain: Record<string, any[]> = {};
  for (const [chain, payload] of Object.entries(allow)) {
    poolsByChain[chain] = (payload.pools || []).map((p) => ({
      address: p.address,
      token0: p.token0,
      token1: p.token1,
      kind: p.kind,
      feeTierBps: p.feeTierBps
    }));
  }
  for (const [chain, pools] of Object.entries(FALLBACK_POOLS)) {
    if (!poolsByChain[chain] || poolsByChain[chain].length === 0) {
      poolsByChain[chain] = pools;
    }
  }
  const tsOut = `// auto-generated by scripts/discoverPools.ts
export type GeneratedPool = {
  address: \`0x\${string}\`;
  token0: \`0x\${string}\`;
  token1: \`0x\${string}\`;
  kind: "uniswap-v2" | "uniswap-v3" | "algebra" | "solidly";
  feeTierBps?: number;
};
export const generatedPoolsByChain: Record<string, GeneratedPool[]> = ${JSON.stringify(
    poolsByChain,
    null,
    2
  )} as const;
`;
  // Write alongside the config in apps/api/src/dex
  const tsPath = path.resolve(__dirname, "..", "src/dex/pools.generated.ts");
  fs.writeFileSync(tsPath, tsOut);
  // Also emit a CJS helper so Node `require` works without TS loaders
  const jsOut = `// auto-generated by scripts/discoverPools.ts
module.exports = {
  generatedPoolsByChain: ${JSON.stringify(poolsByChain, null, 2)}
};
`;
  const jsPath = path.resolve(__dirname, "..", "src/dex/pools.generated.js");
  fs.writeFileSync(jsPath, jsOut);
  console.log(`Wrote ${tsPath} and ${jsPath} (generated pools by chain)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
