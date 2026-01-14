import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import chatRoutes from "./chat";
import { redis } from "../redis";

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
    // Force cached prediction path to avoid /infer; still call live /chat
    hasLocalArtifacts: () => false
  };
});
vi.mock("../chain/config", () => ({
  selectChainWithRpc: (...args: unknown[]) => selectChainWithRpcMock(...args)
}));
vi.mock("../chain/gating", () => ({
  getPremiumStatus: (...args: unknown[]) => getPremiumStatusMock(...args)
}));

describe("chatRoutes conversation history", () => {
  // NOTE: Requires AI service running locally with OPENAI_API_KEY configured.
  beforeEach(async () => {
    vi.clearAllMocks();
    await redis.flushall();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      walletAddress: "0x0000000000000000000000000000000000000001"
    });
    prismaMock.market.findFirst.mockResolvedValue({ id: "m1" });
    prismaMock.modelPrediction.findFirst.mockResolvedValue({
      horizonMinutes: 60,
      asOf: new Date(),
      probabilities: { pUp: 0.6, pDown: 0.4 },
      regime: { label: "bull", confidence: 0.7 },
      featureImportances: [{ feature: "ema", importance: 0.2 }]
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

  it("creates conversation and stores threaded messages", { timeout: 60_000 }, async () => {
    const app = await buildApp();
    // create conversation
    const convRes = await app.inject({
      method: "POST",
      url: "/ai/conversations",
      headers: { authorization: "Bearer token" },
      payload: { title: "My thread" }
    });
    expect(convRes.statusCode).toBe(200);
    const conv = convRes.json();
    expect(conv.id).toBeTruthy();

    // first message
    const chat1 = await app.inject({
      method: "POST",
      url: "/ai/chat",
      headers: { authorization: "Bearer token" },
      payload: { message: "Hi 1", conversationId: conv.id, symbol: "BTC/USDT", timeframe: "1h" }
    });
    expect(chat1.statusCode).toBe(200);
    expect(chat1.json().conversationId).toBe(conv.id);

    // second message should include prior history
    const chat2 = await app.inject({
      method: "POST",
      url: "/ai/chat",
      headers: { authorization: "Bearer token" },
      payload: { message: "Hi 2", conversationId: conv.id, symbol: "BTC/USDT", timeframe: "1h" }
    });
    expect(chat2.statusCode).toBe(200);

    // verify messages stored
    const history = await app.inject({
      method: "GET",
      url: `/ai/conversations/${conv.id}`,
      headers: { authorization: "Bearer token" }
    });
    expect(history.statusCode).toBe(200);
    const body = history.json();
    expect(body.messages.length).toBe(4); // user+assistant for each call

  });
});
