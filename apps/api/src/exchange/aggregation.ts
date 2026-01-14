import { loadCredentials } from "./credentials";
import { fetchBinanceBalances, BalanceResponse } from "./binance";

export type AggregatedBalances = {
  totalExchanges: number;
  exchanges: BalanceResponse[];
};

export const aggregateBalances = async (userId: string, exchanges: string[]): Promise<AggregatedBalances> => {
  const results: BalanceResponse[] = [];
  for (const ex of exchanges) {
    if (ex.toLowerCase() === "binance") {
      const creds = await loadCredentials(userId, "binance");
      if (!creds) continue;
      try {
        const bal = await fetchBinanceBalances(creds);
        results.push(bal);
      } catch {
        // ignore failed exchange
      }
    } else {
      // stub for other exchanges
      results.push({ exchange: ex, balances: {} });
    }
  }
  return { totalExchanges: results.length, exchanges: results };
};
