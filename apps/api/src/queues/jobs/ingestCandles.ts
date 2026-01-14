import { Job, Processor } from "bullmq";
import { ingestMarketCandles, MarketIngestionTarget } from "../../market/ingest";

export type IngestCandlesJob = Job<MarketIngestionTarget>;

export const ingestCandlesProcessor: Processor<MarketIngestionTarget> = async (job: IngestCandlesJob) => {
  job.log(`Starting candle ingestion for ${job.data.symbol} (${job.data.exchange}) ${job.data.timeframe}`);

  if ((job.data.exchange ?? "").toLowerCase().startsWith("dex-")) {
    job.log("Skipping ccxt ingestion for dex market");
    return { inserted: 0, requested: 0, skipped: true, reason: "dex market" };
  }

  const result = await ingestMarketCandles(job.data);

  job.log(
    `Ingested candles for ${job.data.symbol} (${job.data.exchange}) ${job.data.timeframe} inserted=${result.inserted} requested=${result.requested}`
  );

  return result;
};
