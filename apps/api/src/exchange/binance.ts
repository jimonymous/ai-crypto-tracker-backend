import ccxt from "ccxt";
import { ExchangeCredential } from "./credentials";

export type BalanceResponse = {
  exchange: string;
  balances: Record<string, { free: number; used: number; total: number }>;
};

export const fetchBinanceBalances = async (creds: ExchangeCredential): Promise<BalanceResponse> => {
  const binance = new ccxt.binance({
    apiKey: creds.apiKey,
    secret: creds.secret,
    enableRateLimit: true
  });
  const balances = await binance.fetchBalance();
  return {
    exchange: "binance",
    balances: balances.total as any
  };
};
