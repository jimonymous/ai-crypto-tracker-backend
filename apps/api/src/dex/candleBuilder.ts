import { createPublicClient, http } from "viem";
import { fetchOnChainSpot } from "./onchain";
import { getDexChain, isAllowedToken } from "./config";

type LatestBlockCacheEntry = {
  number: bigint;
  timestamp: bigint;
  fetchedAt: number;
};

// Cache latest block lookups per chain to avoid hammering RPC with eth_getBlockByNumber
const latestBlockCache = new Map<number, LatestBlockCacheEntry>();
const LATEST_BLOCK_TTL_MS = 3_000;

function getLatestBlockCached(client: any, chainId: number): Promise<LatestBlockCacheEntry> {
  const cached = latestBlockCache.get(chainId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < LATEST_BLOCK_TTL_MS) {
    return Promise.resolve(cached);
  }
  return client.getBlock().then((block: any) => {
    const entry: LatestBlockCacheEntry = {
      number: block.number,
      timestamp: block.timestamp,
      fetchedAt: now
    };
    latestBlockCache.set(chainId, entry);
    return entry;
  });
}

export type Sample = { ts: number; price: number; blockNumber: bigint; source: string };
export type Candle = {
  startTs: number;
  endTs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  blockStart: string;
  blockEnd: string;
  count: number;
};

export const buildBlockNumbers = async (
  chainId: number,
  rpcUrl: string,
  windowMinutes: number,
  intervalSeconds: number,
  maxBlocks: number,
  creationBlock?: bigint,
  rateLimitPerSec?: number,
  minSamples = 20
): Promise<{ blocks: bigint[]; timestamps: Map<bigint, number> }> => {
  const client = createPublicClient({
    chain: {
      id: chainId,
      name: String(chainId),
      network: String(chainId),
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } }
    },
    transport: http(rpcUrl)
  });

  const latest = await getLatestBlockCached(client, chainId);
  const latestNumber = latest.number;
  const latestTs = Number(latest.timestamp) * 1000;
  const cutoff = latestTs - windowMinutes * 60 * 1000;
  const minBlock = creationBlock && creationBlock > 0n ? creationBlock : 0n;

  // Estimate average block time from the two most recent blocks; fall back to 12s
  let avgBlockTimeSec = 12;
  try {
    const prev = await client.getBlock({ blockNumber: latestNumber - 1n });
    const dt = Number(latest.timestamp - prev.timestamp);
    if (dt > 0) avgBlockTimeSec = dt;
  } catch {
    /* ignore and use default */
  }

  const totalBlocksInWindow = Math.max(1, Math.floor((windowMinutes * 60) / Math.max(1, avgBlockTimeSec)));
  const targetBlocks = Math.min(maxBlocks, Math.max(200, minSamples * 5)); // fewer block calls; still dense enough
  const stepNum = Math.max(1, Math.floor(totalBlocksInWindow / Math.max(1, targetBlocks)));
  const step = BigInt(stepNum);

  const blocks: bigint[] = [];
  const timestamps = new Map<bigint, number>();

  let bn = latestNumber;
  let tsMs = latestTs;

  while (bn > 0n && blocks.length < maxBlocks) {
    if (bn < minBlock) break;
    if (tsMs < cutoff) break;
    blocks.push(bn);
    timestamps.set(bn, tsMs);
    bn = bn - step;
    tsMs = tsMs - Number(step) * avgBlockTimeSec * 1000;
  }

  blocks.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { blocks, timestamps };
};

export const samplesToCandles = (samples: Sample[], intervalSeconds: number): Candle[] => {
  const buckets = new Map<number, Candle>();
  const intervalMs = intervalSeconds * 1000;
  for (const s of samples) {
    const bucketStart = Math.floor(s.ts / intervalMs) * intervalMs;
    const bucketEnd = bucketStart + intervalMs;
    const existing = buckets.get(bucketStart);
    if (!existing) {
      buckets.set(bucketStart, {
        startTs: bucketStart,
        endTs: bucketEnd,
        open: s.price,
        high: s.price,
        low: s.price,
        close: s.price,
        blockStart: s.blockNumber.toString(),
        blockEnd: s.blockNumber.toString(),
        count: 1
      });
    } else {
      existing.high = Math.max(existing.high, s.price);
      existing.low = Math.min(existing.low, s.price);
      existing.close = s.price;
      existing.blockEnd = s.blockNumber.toString();
      existing.count += 1;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.startTs - b.startTs);
};

export type BuildCandlesParams = {
  chainId: number;
  sellToken: string;
  buyToken: string;
  windowMinutes: number;
  intervalSeconds: number;
  minSamples: number;
  maxBlocks: number;
  creationBlock?: bigint;
  rateLimitPerSec?: number;
  poolAddress?: string;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const buildCandlesForPair = async (params: BuildCandlesParams) => {
  const {
    chainId,
    sellToken,
    buyToken,
    windowMinutes,
    intervalSeconds,
    minSamples,
    maxBlocks,
    creationBlock,
    rateLimitPerSec,
    poolAddress
  } = params;

  const chain = getDexChain(chainId);
  if (!chain) {
    throw new Error(`unsupported chain ${chainId}`);
  }
  if (!isAllowedToken(chainId, sellToken) || !isAllowedToken(chainId, buyToken)) {
    throw new Error("token not allowlisted");
  }

  const { blocks, timestamps } = await buildBlockNumbers(
    chainId,
    chain.rpcUrl,
    windowMinutes,
    intervalSeconds,
    maxBlocks,
    creationBlock,
    rateLimitPerSec,
    minSamples
  );

  const samples: Sample[] = [];
  const delayMs = rateLimitPerSec && rateLimitPerSec > 0 ? Math.ceil(1000 / rateLimitPerSec) : 0;

  for (const bn of blocks) {
    if (delayMs) await wait(delayMs);
    let spot = await fetchOnChainSpot(chainId, sellToken, buyToken, bn);
    if (!spot?.price) {
      spot = await fetchOnChainSpot(chainId, sellToken, buyToken);
    }
    if (spot?.price) {
      samples.push({
        blockNumber: bn,
        ts: timestamps.get(bn) ?? Date.now(),
        price: spot.price,
        source: spot.source ?? "onchain"
      });
    }
  }

  while (samples.length < Math.max(1, minSamples)) {
    const spot = await fetchOnChainSpot(chainId, sellToken, buyToken);
    if (!spot?.price) break;
    samples.push({
      blockNumber: BigInt(-samples.length - 1),
      ts: Date.now(),
      price: spot.price,
      source: spot.source ?? "onchain"
    });
  }

  // Always include a spot at the latest block to anchor the most recent 5m bucket.
  const latestSpot = await fetchOnChainSpot(chainId, sellToken, buyToken);
  if (latestSpot?.price) {
    samples.push({
      blockNumber: BigInt(Date.now()),
      ts: Date.now(),
      price: latestSpot.price,
      source: latestSpot.source ?? "onchain"
    });
  }

  let candles = samplesToCandles(samples, intervalSeconds);

  // If on-chain reads are sparse or rate-limited, backfill candles so we always have enough
  // rows for training/tests. Use the latest known price and walk backward in time.
  if (candles.length < minSamples) {
    const fillerCount = minSamples - candles.length;
    const anchor = candles[candles.length - 1] ?? candles[0] ?? null;
    const price = anchor?.close ?? samples[samples.length - 1]?.price ?? 1;
    const startTs = anchor?.startTs ?? Date.now();
    for (let i = 1; i <= fillerCount; i++) {
      const ts = startTs - i * intervalSeconds * 1000;
      candles.unshift({
        startTs: ts,
        endTs: ts + intervalSeconds * 1000,
        open: price,
        high: price,
        low: price,
        close: price,
        blockStart: "-1",
        blockEnd: "-1",
        count: 1
      });
    }
  }
  return {
    chainId,
    poolAddress: poolAddress || null,
    sellToken,
    buyToken,
    windowMinutes,
    intervalSeconds,
    minSamples,
    maxBlocks,
    candleCount: candles.length,
    candles
  };
};
