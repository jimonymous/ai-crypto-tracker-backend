import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const addMock = vi.hoisted(() => vi.fn());
const duplicateQueue = () => ({
  add: addMock,
  getRepeatableJobs: vi.fn(async () => [])
});

vi.mock("fs", () => {
  const existsSync = vi.fn(() => true);
  return { default: { existsSync }, existsSync };
});

vi.mock("../config", () => ({
  config: {
    REDIS_URL: "redis://localhost:6379",
    QUEUE_PREFIX: "test",
    REWARD_EPOCH_MINUTES: 5
  }
}));

vi.mock("./index", () => ({
  QUEUE_NAMES: {
    candleIngestion: "candle-ingestion",
    indicatorCalc: "indicator-calc",
    aiInference: "ai-inference",
    rewardsAccrual: "rewards-accrual",
    onchainAnchoring: "onchain-anchoring",
    alertsEval: "alerts-eval",
    dexCandleIngestion: "dex-candle-ingestion"
  },
  candleIngestionQueue: duplicateQueue(),
  indicatorCalcQueue: duplicateQueue(),
  aiInferenceQueue: duplicateQueue(),
  rewardsAccrualQueue: duplicateQueue(),
  onchainAnchoringQueue: duplicateQueue(),
  alertsEvalQueue: duplicateQueue(),
  dexCandleIngestionQueue: duplicateQueue()
}));

const ingestionTargets = [
  { marketId: "m1", symbol: "BTC/USDT", timeframe: "1h" },
  { marketId: "m2", symbol: "ETH/USDT", timeframe: "4h" }
];

vi.mock("../market/ingest", () => ({
  getIngestionTargets: vi.fn(async () => ingestionTargets),
  getDexMarketTargets: vi.fn(async () => []),
  timeframeToMs: (tf: string) => {
    if (tf === "4h") return 4 * 60 * 60 * 1000;
    if (tf === "30s") return 30 * 1000;
    if (tf === "5m") return 5 * 60 * 1000;
    return 60 * 60 * 1000;
  }
}));

vi.mock("../dex/config", () => ({
  getDexChains: () => [
    {
      chainId: 1,
      pools: [{ address: "0xpool1" }, { address: "0xpool2" }]
    }
  ]
}));

let startIngestionScheduler: any;

beforeAll(async () => {
  const mod = await import("./schedule");
  startIngestionScheduler = mod.startIngestionScheduler;
});

describe("scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHAIN_PRIVATE_KEY = "0xprivkey";
  });

  it("schedules ingestion, indicators, ai, rewards, alerts", async () => {
    const handles = await startIngestionScheduler();
    expect(addMock).toHaveBeenCalled();
    const jobIds = addMock.mock.calls.map((c) => c[0]);
    expect(jobIds.some((id) => (id as string).startsWith("ingest:"))).toBe(true);
    expect(jobIds.some((id) => (id as string).startsWith("dex:"))).toBe(true);
    expect(jobIds.some((id) => (id as string).startsWith("indicators:"))).toBe(true);
    expect(jobIds.some((id) => (id as string).startsWith("ai:"))).toBe(true);
    expect(jobIds.some((id) => (id as string).startsWith("rewards:accrue"))).toBe(true);
    expect(jobIds.some((id) => (id as string).startsWith("rewards:publish"))).toBe(true);
    expect(jobIds.some((id) => (id as string).startsWith("alerts:"))).toBe(true);
    await handles.stop();
  });
});
