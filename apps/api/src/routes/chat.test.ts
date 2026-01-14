import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import chatRoutes from "./chat";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  market: { findFirst: vi.fn() },
  modelPrediction: { findFirst: vi.fn() },
  indicatorSnapshot: { findFirst: vi.fn() },
  candle: { findMany: vi.fn() }
}));

const ensureActiveAccessMock = vi.hoisted(() => vi.fn());
const selectChainWithRpcMock = vi.hoisted(() => vi.fn());
const getPremiumStatusMock = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../auth/jwt", () => ({ verifyJwt: vi.fn(() => ({ sub: "user-1" })) }));
vi.mock("../billing/accessPass", () => ({ ensureActiveAccess: ensureActiveAccessMock }));
vi.mock("../ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/client")>();
  return {
    ...actual,
    // avoid /infer in tests; rely on cached prediction
    hasLocalArtifacts: () => false
  };
});
vi.mock("../chain/config", () => ({
  selectChainWithRpc: (...args: unknown[]) => selectChainWithRpcMock(...args)
}));
vi.mock("../chain/gating", () => ({
  getPremiumStatus: (...args: unknown[]) => getPremiumStatusMock(...args)
}));

describe("chatRoutes /ai/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      walletAddress: "0x0000000000000000000000000000000000000001"
    });
    prismaMock.market.findFirst.mockResolvedValue({ id: "m1" });
    prismaMock.modelPrediction.findFirst.mockResolvedValue({
      horizonMinutes: 60,
      asOf: new Date(),
      probabilities: { pUp: 0.4 },
      regime: { label: "neutral", confidence: 0.5 },
      featureImportances: [{ feature: "ema", importance: 0.1 }]
    });
    prismaMock.indicatorSnapshot.findFirst.mockResolvedValue({
      data: { latest: { ema20: 1 }, series: [{ name: "ema", values: [] }] }
    });
    prismaMock.candle.findMany.mockResolvedValue([
      { timestamp: new Date("2024-01-01T00:00:00Z"), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { timestamp: new Date("2024-01-01T01:00:00Z"), open: 1.5, high: 2.5, low: 1, close: 2, volume: 12 }
    ]);
    ensureActiveAccessMock.mockResolvedValue({ expiresAt: new Date(), walletAddress: "0xabc" });
    selectChainWithRpcMock.mockReturnValue({
      id: 1,
      chainId: 1,
      name: "testnet",
      rpcUrl: "http://rpc",
      token: { address: "0x000000000000000000000000000000000000000a", decimals: 18 },
      treasury: "0x000000000000000000000000000000000000000b",
      premiumPass: { address: "0x000000000000000000000000000000000000000c" },
      rewards: { address: "0x000000000000000000000000000000000000000d" }
    });
    getPremiumStatusMock.mockResolvedValue({ eligible: true, missing: [] });
  });

  const buildApp = async () => {
    const app = Fastify();
    await app.register(chatRoutes);
    await app.ready();
    return app;
  };

  it("returns AI inference when service succeeds", { timeout: 60_000 }, async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/ai/chat",
      headers: { authorization: "Bearer token" },
      payload: { message: "hi", symbol: "BTC/USDT", timeframe: "1h", horizonMinutes: 30 }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().chat.output).toBeTruthy();
  });

  it("falls back to cached prediction when inference fails", { timeout: 60_000 }, async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/ai/chat",
      headers: { authorization: "Bearer token" },
      payload: { message: "hi", symbol: "BTC/USDT", timeframe: "1h", horizonMinutes: 30 }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().summary.probabilities.pUp).toBe(0.4);
  });

  it("rejects when premium gating fails", async () => {
    getPremiumStatusMock.mockResolvedValue({ eligible: false, missing: [{ role: "premium" }] });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/ai/chat",
      headers: { authorization: "Bearer token" },
      payload: { message: "hi", symbol: "BTC/USDT", timeframe: "1h", horizonMinutes: 30 }
    });
    expect(res.statusCode).toBe(402);
  });

  it("returns 503 when no artifacts and no cached prediction exist", async () => {
    prismaMock.modelPrediction.findFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/ai/chat",
      headers: { authorization: "Bearer token" },
      payload: { message: "hi", symbol: "BTC/USDT", timeframe: "1h" }
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().reason).toBe("missing_artifacts_and_cache");
  });

  it("does not attempt access pass issuance when market is missing", async () => {
    prismaMock.market.findFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/ai/chat",
      headers: { authorization: "Bearer token" },
      payload: { message: "hi", symbol: "UNKNOWN/USDT", timeframe: "1h" }
    });

    expect(res.statusCode).toBe(404);
    expect(ensureActiveAccessMock).not.toHaveBeenCalled();
  });
});
