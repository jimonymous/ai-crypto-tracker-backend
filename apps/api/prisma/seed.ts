import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const markets = [
  { symbol: "WBTC/USDT", baseAsset: "WBTC", quoteAsset: "USDT", exchange: "binance", timeframe: "1h" },
  { symbol: "WBTC/USDT", baseAsset: "WBTC", quoteAsset: "USDT", exchange: "binance", timeframe: "4h" },
  { symbol: "ETH/USDT", baseAsset: "ETH", quoteAsset: "USDT", exchange: "binance", timeframe: "1h" },
  { symbol: "SOL/USDT", baseAsset: "SOL", quoteAsset: "USDT", exchange: "binance", timeframe: "1h" },
  { symbol: "WBTC/USD", baseAsset: "WBTC", quoteAsset: "USD", exchange: "coinbase", timeframe: "1h" },
  { symbol: "ETH/USD", baseAsset: "ETH", quoteAsset: "USD", exchange: "coinbase", timeframe: "1h" }
];

async function main() {
  for (const market of markets) {
    await prisma.market.upsert({
      where: {
        symbol_exchange: {
          symbol: market.symbol,
          exchange: market.exchange
        }
      },
      create: market,
      update: {
        timeframe: market.timeframe,
        baseAsset: market.baseAsset,
        quoteAsset: market.quoteAsset
      }
    });
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
