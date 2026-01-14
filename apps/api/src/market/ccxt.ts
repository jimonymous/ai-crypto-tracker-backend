import ccxt, { Exchange, OHLCV } from "ccxt";

type ExchangeId = keyof typeof ccxt;

const exchangeCache = new Map<string, Exchange>();
const loadedMarkets = new Set<string>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getExchange = (exchangeId: string): Exchange => {
  if (exchangeCache.has(exchangeId)) {
    return exchangeCache.get(exchangeId)!;
  }

  const ExchangeClass = (ccxt as Record<string, any>)[exchangeId] as typeof Exchange | undefined;
  if (!ExchangeClass) {
    throw new Error(`Unsupported exchange: ${exchangeId}`);
  }

  const instance = new ExchangeClass({
    enableRateLimit: true,
    timeout: 15000
  });

  exchangeCache.set(exchangeId, instance);
  return instance;
};

const ensureMarketsLoaded = async (exchange: Exchange) => {
  if (!loadedMarkets.has(exchange.id)) {
    await exchange.loadMarkets();
    loadedMarkets.add(exchange.id);
  }
};

export type FetchOHLCVParams = {
  exchangeId: ExchangeId | string;
  symbol: string;
  timeframe: string;
  since?: number;
  limit?: number;
};

export const fetchOHLCVWithRateLimit = async (params: FetchOHLCVParams): Promise<OHLCV[]> => {
  const { exchangeId, symbol, timeframe, since, limit = 500 } = params;
  const exchange = getExchange(exchangeId);
  await ensureMarketsLoaded(exchange);

  const maxAttempts = 3;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      return await exchange.fetchOHLCV(symbol, timeframe, since, limit);
    } catch (err: any) {
      attempt += 1;
      const isRateLimited = err instanceof ccxt.RateLimitExceeded;
      const isNetworkError = err instanceof ccxt.NetworkError;

      if (isRateLimited || isNetworkError) {
        const delay = Math.max(exchange.rateLimit ?? 1000, 500) * attempt;
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  throw new Error(`Failed to fetch OHLCV for ${symbol} on ${exchangeId} after ${maxAttempts} attempts`);
};
