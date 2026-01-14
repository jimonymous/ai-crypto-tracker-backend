import { DexChainConfig, findToken, getDexChain, isAllowedToken } from "./config";
import { getCachedQuote, QuoteResult } from "./aggregators";
import { fetchOnChainSpot } from "./onchain";
import { encodeFunctionData, encodePacked } from "viem";

export type CycleLeg = {
  from: string;
  to: string;
  price: number;
  source: QuoteResult["source"];
};

export type CycleOpportunity = {
  chainId: number;
  path: string[];
  profitPct: number;
  shelfLifeMs: number | null;
  expectedProfit: number;
  minBankrollForTarget: number;
  legs: CycleLeg[];
  calldata: { to: string | null; data: string | null; description: string }[];
  multicall?: {
    to: string;
    data: `0x${string}`;
    router: string;
    amountIn: string;
    amountOutMin: string;
    deadline: number;
  };
};

const shelfLifeMs = (quote?: QuoteResult | null): number | null => {
  if (!quote?.fetchedAt || !quote?.ttlSeconds) return null;
  const expiresAt = quote.fetchedAt + quote.ttlSeconds * 1000;
  const ms = expiresAt - Date.now();
  return ms > 0 ? ms : 0;
};

const getQuote = async (
  chain: DexChainConfig,
  from: string,
  to: string,
  amount: string
): Promise<QuoteResult | null> => {
  const agg = await getCachedQuote(chain, from, to, amount);
  if (agg?.price) return agg;
  return fetchOnChainSpot(chain.chainId, from, to);
};

const canUseV2Path = (chain: DexChainConfig, path: string[]) => {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const hasV2 = chain.pools.some(
      (p) =>
        (p.kind === "uniswap-v2" || p.kind === "algebra") &&
        ((p.token0.toLowerCase() === a.toLowerCase() && p.token1.toLowerCase() === b.toLowerCase()) ||
          (p.token1.toLowerCase() === a.toLowerCase() && p.token0.toLowerCase() === b.toLowerCase()))
    );
    if (!hasV2) return false;
  }
  return !!chain.routers?.v2Router;
};

const findV3Fee = (chain: DexChainConfig, a: string, b: string): number | null => {
  const pool = chain.pools.find(
    (p) =>
      p.kind === "uniswap-v3" &&
      ((p.token0.toLowerCase() === a.toLowerCase() && p.token1.toLowerCase() === b.toLowerCase()) ||
        (p.token1.toLowerCase() === a.toLowerCase() && p.token0.toLowerCase() === b.toLowerCase()))
  );
  return pool?.feeTierBps ?? null;
};

const canUseV3Path = (chain: DexChainConfig, path: string[]) => {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const fee = findV3Fee(chain, a, b);
    if (fee == null) return false;
  }
  return !!chain.routers?.swapRouter;
};

const buildV3PathBytes = (tokens: string[], fees: number[]) => {
  const types: string[] = [];
  const values: any[] = [];
  for (let i = 0; i < tokens.length; i++) {
    types.push("address");
    values.push(tokens[i]);
    if (i < fees.length) {
      types.push("uint24");
      values.push(fees[i]);
    }
  }
  return encodePacked(types as any, values as any);
};

const buildV2Multicall = (
  chain: DexChainConfig,
  path: string[],
  amountIn: string,
  priceProduct: number,
  slippageBps: number
) => {
  if (!canUseV2Path(chain, path)) return null;
  const slipFactor = Math.max(0, 1 - slippageBps / 10_000);
  const expectedOut = Number(amountIn) * priceProduct;
  const minOut = Math.floor(expectedOut * Math.pow(slipFactor, path.length - 1));
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const { encodeFunctionData } = require("viem");
  const data = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "swapExactTokensForTokens",
        inputs: [
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMin", type: "uint256" },
          { name: "path", type: "address[]" },
          { name: "to", type: "address" },
          { name: "deadline", type: "uint256" }
        ],
        outputs: [{ name: "amounts", type: "uint256[]" }]
      }
    ],
    functionName: "swapExactTokensForTokens",
    args: [amountIn, `${minOut}`, path, path[0], BigInt(deadline)]
  }) as `0x${string}`;
  return {
    to: chain.routers!.v2Router as string,
    data,
    router: chain.name,
    amountIn,
    amountOutMin: `${minOut}`,
    deadline
  };
};

const buildV3Multicall = (
  chain: DexChainConfig,
  path: string[],
  priceProduct: number,
  amountIn: string,
  slippageBps: number
) => {
  if (!canUseV3Path(chain, path)) return null;
  // Algebra/solidly not yet supported for multicall path building
  const fees: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const fee = findV3Fee(chain, path[i], path[i + 1]);
    if (fee == null) return null;
    fees.push(fee);
  }
  const slipFactor = Math.max(0, 1 - slippageBps / 10_000);
  const expectedOut = Number(amountIn) * priceProduct;
  const minOut = Math.floor(expectedOut * Math.pow(slipFactor, path.length - 1));
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const pathBytes = buildV3PathBytes(path, fees);
  const data = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "exactInput",
        inputs: [
          {
            components: [
              { name: "path", type: "bytes" },
              { name: "recipient", type: "address" },
              { name: "deadline", type: "uint256" },
              { name: "amountIn", type: "uint256" },
              { name: "amountOutMinimum", type: "uint256" }
            ],
            name: "params",
            type: "tuple"
          }
        ],
        outputs: [{ name: "amountOut", type: "uint256" }]
      }
    ],
    functionName: "exactInput",
    args: [
      {
        path: pathBytes,
        recipient: path[0],
        deadline: BigInt(deadline),
        amountIn,
        amountOutMinimum: `${minOut}`
      }
    ]
  }) as `0x${string}`;
  return {
    to: chain.routers!.swapRouter as string,
    data,
    router: chain.name,
    amountIn,
    amountOutMin: `${minOut}`,
    deadline
  };
};

const profitForCycle = async (
  chain: DexChainConfig,
  a: string,
  b: string,
  c: string,
  amount: string
) => {
  const quotes = await Promise.all([
    getQuote(chain, a, b, amount),
    getQuote(chain, b, c, amount),
    getQuote(chain, c, a, amount)
  ]);
  if (quotes.some((q) => !q?.price)) return null;
  const [ab, bc, ca] = quotes as QuoteResult[];
  const product = (ab.price as number) * (bc.price as number) * (ca.price as number);
  const profitPct = product - 1;
  const shelf = [shelfLifeMs(ab), shelfLifeMs(bc), shelfLifeMs(ca)].filter((v): v is number => v != null);
  const shelfLifeMsVal = shelf.length ? Math.min(...shelf) : null;
  return {
    profitPct,
    shelfLifeMs: shelfLifeMsVal,
    legs: [
      { from: a, to: b, price: ab.price as number, source: ab.source },
      { from: b, to: c, price: bc.price as number, source: bc.source },
      { from: c, to: a, price: ca.price as number, source: ca.source }
    ],
    raw: quotes
  };
};

export const findCycles = async (params: {
  chainId: number;
  tokens: string[];
  bases?: string[];
  amount: string;
  minProfitPct: number;
  maxBankroll: number;
  minProfitAbs: number;
  slippageBps: number;
}): Promise<CycleOpportunity[]> => {
  const { chainId, tokens, bases, amount, minProfitPct, maxBankroll, minProfitAbs, slippageBps } = params;
  const chain = getDexChain(chainId);
  if (!chain) return [];

  const allowlisted = tokens
    .filter((t) => isAllowedToken(chainId, t))
    .map((t) => findToken(chain, t)?.address ?? t);
  if (allowlisted.length < 3) return [];
  const baseSet = new Set((bases ?? []).map((b) => b.toLowerCase()));

  const opps: CycleOpportunity[] = [];
  for (let i = 0; i < allowlisted.length; i++) {
    for (let j = i + 1; j < allowlisted.length; j++) {
      for (let k = j + 1; k < allowlisted.length; k++) {
        const a = allowlisted[i];
        const b = allowlisted[j];
        const c = allowlisted[k];
        if (baseSet.size && !baseSet.has(a.toLowerCase())) continue;
        const res = await profitForCycle(chain, a, b, c, amount);
        if (!res) continue;
        if (res.profitPct < minProfitPct) continue;
        const slipFactor = Math.max(0, 1 - slippageBps / 10_000);
        const adjustedProfitPct = (res.profitPct + 1) * Math.pow(slipFactor, 3) - 1;
        if (adjustedProfitPct < minProfitPct) continue;
        const expectedProfit = maxBankroll * adjustedProfitPct;
        const minBankrollForTarget =
          adjustedProfitPct > 0 ? Math.max(0, minProfitAbs / adjustedProfitPct) : Number.POSITIVE_INFINITY;
        const priceProduct = res.legs.reduce((prod, leg) => prod * (leg.price as number), 1);
        let multicall = buildV2Multicall(chain, [a, b, c, a], amount, priceProduct, slippageBps);
        if (!multicall) {
          multicall = buildV3Multicall(chain, [a, b, c, a], priceProduct, amount, slippageBps);
        }
        opps.push({
          chainId,
          path: [a, b, c, a],
          profitPct: adjustedProfitPct,
          shelfLifeMs: res.shelfLifeMs,
          expectedProfit,
          minBankrollForTarget,
          legs: res.legs,
          calldata: res.legs.map((leg, idx) => ({
            to: res.raw[idx]?.raw?.to ?? null,
            data: res.raw[idx]?.raw?.data ?? null,
            description: `Unsigned call for ${leg.from}->${leg.to}`
          })),
          multicall: multicall ?? undefined
        });
      }
    }
  }

  opps.sort((a, b) => b.profitPct - a.profitPct);
  return opps;
};
