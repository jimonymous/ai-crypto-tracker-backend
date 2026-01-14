import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import snapshotRoutes from "./snapshot";
import chatRoutes from "./chat";
import billingRoutes from "./billing";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  market: { findFirst: vi.fn() },
  candle: { findMany: vi.fn() },
  indicatorSnapshot: { findFirst: vi.fn() },
  modelPrediction: { findFirst: vi.fn() }
}));
const redisMock = vi.hoisted(() => ({ get: vi.fn() }));
const ensureActiveAccessMock = vi.hoisted(() => vi.fn());
const selectChainWithRpcMock = vi.hoisted(() => vi.fn());
const verifyErc20TransferMock = vi.hoisted(() => vi.fn());
const getPriceInfoMock = vi.hoisted(() => vi.fn());
const verifyJwtMock = vi.hoisted(() => vi.fn());
const getPremiumStatusMock = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../redis", () => ({ redis: redisMock }));
vi.mock("../billing/accessPass", () => ({
  ensureActiveAccess: ensureActiveAccessMock,
  getPriceInfo: getPriceInfoMock
}));
vi.mock("../auth/jwt", () => ({
  verifyJwt: (...args: unknown[]) => verifyJwtMock(...args)
}));
vi.mock("../ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/client")>();
  return {
    ...actual,
    hasLocalArtifacts: () => false
  };
});
vi.mock("../chain/config", () => ({
  selectChainWithRpc: (...args: unknown[]) => selectChainWithRpcMock(...args),
  getPrimaryChain: () => ({
    id: 1,
    name: "test",
    rpcUrl: "http://rpc",
    token: { address: "0x1", decimals: 18 },
    treasury: "0x2",
    premiumPass: { address: "0x3" },
    rewards: { address: "0x4" }
  })
}));
vi.mock("../chain/verifyTransfer", () => ({
  verifyErc20Transfer: (...args: unknown[]) => verifyErc20TransferMock(...args)
}));
vi.mock("../chain/gating", () => ({
  getPremiumStatus: (...args: unknown[]) => getPremiumStatusMock(...args)
}));

describe("integration: snapshot + chat + billing", () => {
  const buildApp = async () => {
    const app = Fastify();
    await app.register(snapshotRoutes);
    await app.register(chatRoutes);
    await app.register(billingRoutes);
    await app.ready();
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    verifyJwtMock.mockReturnValue({ sub: "user-1" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1", walletAddress: "0x0000000000000000000000000000000000000001" });
    prismaMock.market.findFirst.mockResolvedValue({ id: "m1" });
    prismaMock.candle.findMany.mockResolvedValue([
      { timestamp: new Date("2024-01-01T00:00:00Z"), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }
    ]);
    prismaMock.indicatorSnapshot.findFirst.mockResolvedValue({ data: { series: [], latest: {} } });
    prismaMock.modelPrediction.findFirst.mockResolvedValue({
      requestId: "cached",
      horizonMinutes: 60,
      asOf: new Date(),
      probabilities: { pUp: 0.5 },
      regime: { label: "neutral", confidence: 0.5 },
      featureImportances: []
    });
    redisMock.get.mockResolvedValue(null);
    ensureActiveAccessMock.mockResolvedValue({ expiresAt: new Date() });
    selectChainWithRpcMock.mockReturnValue({
      id: 1,
      chainId: 1,
      rpcUrl: "http://rpc",
      token: { address: "0x1", decimals: 18 },
      treasury: "0x2",
      premiumPass: { address: "0x3" },
      rewards: { address: "0x4" }
    });
    verifyErc20TransferMock.mockResolvedValue(true);
    getPriceInfoMock.mockReturnValue({ token: "ACT", amount: "1", amountWei: "1000000000000000000", periodMinutes: 60 });
    getPremiumStatusMock.mockResolvedValue({ eligible: true, missing: [] });
  });

  it("flows through snapshot, chat, billing price", { timeout: 60_000 }, async () => {
    const app = await buildApp();

    const snap = await app.inject({ method: "GET", url: "/snapshot?symbol=BTC/USDT&timeframe=1h" });
    expect(snap.statusCode).toBe(200);

    const chat = await app.inject({
      method: "POST",
      url: "/ai/chat",
      headers: { authorization: "Bearer token" },
      payload: { message: "hi", symbol: "BTC/USDT", timeframe: "1h" }
    });
    expect(chat.statusCode).toBe(200);

    const price = await app.inject({ method: "GET", url: "/billing/price?chainId=1" });
    expect(price.statusCode).toBe(200);
  });
});
