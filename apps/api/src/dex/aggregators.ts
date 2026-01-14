import { redis } from "../redis";
import { config } from "../config";
import { DexChainConfig, getDexChain } from "./config";

export type QuoteResult = {
  source: "0x" | "fallback" | "fallback-static" | "pool" | "pool-latest";
  price?: number;
  buyAmount?: string;
  sellAmount?: string;
  gas?: number;
  raw?: any;
  fetchedAt?: number;
  ttlSeconds?: number;
};

const cacheKey = (chainId: number, sellToken: string, buyToken: string, amount: string) =>
  `dex:quote:${chainId}:${sellToken}:${buyToken}:${amount}`;

export const fetchZeroExQuote = async (
  chainId: number,
  sellToken: string,
  buyToken: string,
  amount: string
): Promise<QuoteResult | null> => {
  if (process.env.DISABLE_DEX_AGGREGATOR === "true") return null;
  const cfg = getDexChain(chainId);
  if (!cfg?.aggregators.zerox) return null;
  const url = `${cfg.aggregators.zerox}/swap/v1/quote?sellToken=${sellToken}&buyToken=${buyToken}&sellAmount=${amount}`;
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  const body = await res.json();
  const price = Number(body.price);
  const fetchedAt = Date.now();
  return {
    source: "0x",
    price: Number.isFinite(price) ? price : undefined,
    buyAmount: body.buyAmount,
    sellAmount: body.sellAmount,
    gas: body.estimatedGas,
    raw: body,
    fetchedAt,
    ttlSeconds: config.DEX_QUOTE_CACHE_SECONDS
  };
};

export const getCachedQuote = async (
  chain: DexChainConfig,
  sellToken: string,
  buyToken: string,
  amount: string
): Promise<QuoteResult | null> => {
  const key = cacheKey(chain.chainId, sellToken, buyToken, amount);
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as QuoteResult;
    } catch {
      /* ignore */
    }
  }
  const quote = await fetchZeroExQuote(chain.chainId, sellToken, buyToken, amount);
  if (quote) {
    // ioredis set signature is (key, value, mode, duration)
    const toCache = {
      ...quote,
      fetchedAt: quote.fetchedAt ?? Date.now(),
      ttlSeconds: quote.ttlSeconds ?? config.DEX_QUOTE_CACHE_SECONDS
    };
    await redis.set(key, JSON.stringify(toCache), "EX", config.DEX_QUOTE_CACHE_SECONDS);
  }
  return quote;
};
