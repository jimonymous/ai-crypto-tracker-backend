import { createPublicClient, http, parseAbi } from "viem";
import { DexChainConfig, DexPool, getDexChain, findToken } from "./config";
import type { QuoteResult } from "./aggregators";

const uniswapV3Abi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)"
]);

const erc20Abi = parseAbi(["function decimals() view returns (uint8)"]);

const uniswapV2Abi = parseAbi([
  "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
]);

const algebraAbi = parseAbi([
  "function globalState() view returns (uint160 price, int24 tick, uint16, uint16, uint16, bool)"
]);

export const makeClient = (chain: DexChainConfig) =>
  createPublicClient({
    chain: {
      id: chain.chainId,
      name: chain.name,
      network: chain.name,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [chain.rpcUrl] }, public: { http: [chain.rpcUrl] } }
    },
    transport: http(chain.rpcUrl)
  });

const findPool = (chain: DexChainConfig, sellToken: string, buyToken: string): DexPool | undefined => {
  const s = sellToken.toLowerCase();
  const b = buyToken.toLowerCase();
  return chain.pools.find(
    (p) =>
      (p.token0.toLowerCase() === s && p.token1.toLowerCase() === b) ||
      (p.token0.toLowerCase() === b && p.token1.toLowerCase() === s)
  );
};

const priceFromV3 = async (
  chain: DexChainConfig,
  pool: DexPool,
  sellToken: string,
  buyToken: string,
  blockNumber?: bigint
): Promise<number | null> => {
  const client = makeClient(chain);
  const token0 = findToken(chain, pool.token0);
  const token1 = findToken(chain, pool.token1);
  if (!token0 || !token1) return null;

  const priceFromSqrt = (sqrtPriceX96: bigint) => {
    if (sqrtPriceX96 === 0n) return null;
    const decimalFactor = 10n ** BigInt(18 + token0.decimals - token1.decimals);
    const ratioX192 = (sqrtPriceX96 * sqrtPriceX96 * decimalFactor) >> 192n;
    const price1Per0 = Number(ratioX192) / 1e18;
    if (price1Per0 === 0) return null;
    return pool.token0.toLowerCase() === sellToken.toLowerCase() ? price1Per0 : 1 / price1Per0;
  };

  // Primary path: slot0 spot price
  try {
    const slot = (await client.readContract({
      address: pool.address,
      abi: uniswapV3Abi,
      functionName: "slot0",
      blockNumber
    })) as any;
    const spot = priceFromSqrt(BigInt(slot[0]));
    if (spot && Number.isFinite(spot)) return spot;
  } catch {
    /* fall through to observe fallback */
  }

  // Fallback: short TWAP via observe over ~5 minutes
  try {
    const secondsAgo = 300;
    const [ticks] = (await client.readContract({
      address: pool.address,
      abi: uniswapV3Abi,
      functionName: "observe",
      args: [[secondsAgo, 0]],
      blockNumber
    })) as any;
    const tickDelta = Number(ticks[1] - ticks[0]);
    const avgTick = tickDelta / secondsAgo;
    const ratio = Math.pow(1.0001, avgTick);
    const decimalAdj = Math.pow(10, token0.decimals - token1.decimals);
    const price1Per0 = ratio * decimalAdj;
    if (!Number.isFinite(price1Per0) || price1Per0 === 0) return null;
    return pool.token0.toLowerCase() === sellToken.toLowerCase() ? price1Per0 : 1 / price1Per0;
  } catch {
    return null;
  }
};

const priceFromV2 = async (
  chain: DexChainConfig,
  pool: DexPool,
  sellToken: string,
  buyToken: string,
  blockNumber?: bigint
): Promise<number | null> => {
  const client = makeClient(chain);
  const [reserve0, reserve1] = (await client.readContract({
    address: pool.address,
    abi: uniswapV2Abi,
    functionName: "getReserves",
    blockNumber
  })) as any;
  const token0 = findToken(chain, pool.token0);
  const token1 = findToken(chain, pool.token1);
  if (!token0 || !token1) return null;
  const r0 = Number(reserve0) / 10 ** token0.decimals;
  const r1 = Number(reserve1) / 10 ** token1.decimals;
  if (!r0 || !r1) return null;
  if (pool.token0.toLowerCase() === sellToken.toLowerCase()) {
    return r1 / r0;
  }
  return r0 / r1;
};

const priceFromAlgebra = async (
  chain: DexChainConfig,
  pool: DexPool,
  sellToken: string,
  buyToken: string,
  blockNumber?: bigint
): Promise<number | null> => {
  const client = makeClient(chain);
  const [price] = (await client.readContract({
    address: pool.address,
    abi: algebraAbi,
    functionName: "globalState",
    blockNumber
  })) as any;
  const sqrtPriceX96 = BigInt(price);
  if (sqrtPriceX96 === 0n) return null;
  const token0 = findToken(chain, pool.token0);
  const token1 = findToken(chain, pool.token1);
  if (!token0 || !token1) return null;
  const decimalFactor = 10n ** BigInt(18 + token0.decimals - token1.decimals);
  const ratioX192 = (sqrtPriceX96 * sqrtPriceX96 * decimalFactor) >> 192n;
  const price1Per0 = Number(ratioX192) / 1e18;
  if (pool.token0.toLowerCase() === sellToken.toLowerCase()) {
    return price1Per0;
  }
  if (price1Per0 === 0) return null;
  return 1 / price1Per0;
};

export const fetchOnChainSpot = async (
  chainId: number,
  sellToken: string,
  buyToken: string,
  blockNumber?: bigint
): Promise<QuoteResult | null> => {
  const staticFallback: Record<string, number> = {
    // USDC -> WETH on Ethereum mainnet (approx spot)
    "1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 0.0005
  };
  const chain = getDexChain(chainId);
  if (!chain) return null;
  const pool = findPool(chain, sellToken, buyToken);
  if (!pool) return null;
  const readPrice = async (bn?: bigint) => {
    return pool.kind === "uniswap-v3"
      ? await priceFromV3(chain, pool, sellToken, buyToken, bn)
      : pool.kind === "algebra"
      ? await priceFromAlgebra(chain, pool, sellToken, buyToken, bn)
      : await priceFromV2(chain, pool, sellToken, buyToken, bn);
  };

  const key = `${chainId}:${sellToken.toLowerCase()}:${buyToken.toLowerCase()}`;

  try {
    let price = await readPrice(blockNumber);
    // Many RPC endpoints (e.g., non-archive) reject historical block reads.
    // If the historical call fails or returns a bad value, retry against latest
    // so we still capture a real on-chain quote instead of dropping the sample.
    if ((!price || !Number.isFinite(price)) && blockNumber) {
      price = await readPrice(undefined);
      if (price && Number.isFinite(price)) {
        return { source: "pool-latest", price, fetchedAt: Date.now(), ttlSeconds: 5 };
      }
    }

    if (!price || !Number.isFinite(price)) {
      const alt = staticFallback[key];
      if (alt && Number.isFinite(alt)) {
        return { source: "fallback-static", price: alt, fetchedAt: Date.now(), ttlSeconds: 5 };
      }
      return null;
    }
    return { source: "pool", price, fetchedAt: Date.now(), ttlSeconds: 5 };
  } catch (err) {
    try {
      const price = await readPrice(undefined);
      if (price && Number.isFinite(price)) {
        return { source: "pool-latest", price, fetchedAt: Date.now(), ttlSeconds: 5 };
      }
    } catch {
      // fall through to static fallback below
    }
    const alt = staticFallback[key];
    if (alt && Number.isFinite(alt)) {
      return { source: "fallback-static", price: alt, fetchedAt: Date.now(), ttlSeconds: 5 };
    }
    return null;
  }
};
