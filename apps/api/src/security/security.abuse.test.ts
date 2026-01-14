import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { describe, it, expect, beforeEach, vi } from "vitest";
import billingRoutes from "../routes/billing";
import { signJwt } from "../auth/jwt";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  kycVerification: { upsert: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() }
}));

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../billing/accessPass", () => ({
  getPriceInfo: () => ({ amountWei: "1", tokenAddress: "0x0" }),
  ensureActiveAccess: vi.fn(async (_id: string, walletAddress: string) => ({
    expiresAt: new Date(Date.now() + 60_000),
    periodMinutes: 60,
    walletAddress
  }))
}));
vi.mock("../billing/charge", () => ({
  attemptAutoCharge: vi.fn(async () => {
    const err: any = new Error("auto-charge disabled in test");
    err.statusCode = 402;
    throw err;
  })
}));
vi.mock("../chain/verifyTransfer", () => ({ verifyErc20Transfer: vi.fn(async () => false) }));
vi.mock("../chain/config", () => ({
  selectChainWithRpc: () => ({
    id: 31337,
    token: { address: "0x0000000000000000000000000000000000000001", decimals: 18 },
    treasury: "0x0000000000000000000000000000000000000002"
  })
}));
vi.mock("../chain/publicClient", () => ({
  makePublicClient: () => ({ waitForTransactionReceipt: vi.fn(async () => ({})) }),
  makeWalletClient: () => null
}));

describe("security/abuse protections", () => {
  beforeEach(() => {
    vi.resetModules();
    prismaMock.user.findUnique.mockReset();
  });

  it("rejects missing and malformed JWTs on protected routes", async () => {
    process.env.JWT_SECRET = "test-secret";
    const app = Fastify();
    await app.register(billingRoutes);

    const missing = await app.inject({ method: "POST", url: "/billing/purchase" });
    expect(missing.statusCode).toBe(401);

    const bad = await app.inject({
      method: "POST",
      url: "/billing/purchase",
      headers: { authorization: "Bearer not-a-valid-jwt" }
    });
    expect(bad.statusCode).toBe(401);
  });

  it("accepts valid JWT and returns payment required when no wallet is found", async () => {
    process.env.JWT_SECRET = "test-secret";
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1", walletAddress: null });
    const app = Fastify();
    await app.register(billingRoutes);
    const token = signJwt({ sub: "user-1" });
    const res = await app.inject({
      method: "POST",
      url: "/billing/purchase",
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    expect(res.statusCode).toBe(400);
  });

  it("enforces per-route rate limits", async () => {
    const app = Fastify();
    await app.register(rateLimit, { global: false });
    app.get(
      "/limited",
      { config: { rateLimit: { max: 2, timeWindow: 1000 } } },
      async () => ({ ok: true })
    );
    const first = await app.inject({ method: "GET", url: "/limited" });
    const second = await app.inject({ method: "GET", url: "/limited" });
    const third = await app.inject({ method: "GET", url: "/limited" });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
  });

  it("enforces global rate limit when configured", async () => {
    const app = Fastify();
    await app.register(rateLimit, { max: 2, timeWindow: 1000 });
    app.get("/ping", async () => ({ ok: true }));
    const a = await app.inject({ method: "GET", url: "/ping" });
    const b = await app.inject({ method: "GET", url: "/ping" });
    const c = await app.inject({ method: "GET", url: "/ping" });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(c.statusCode).toBe(429);
  });
});
