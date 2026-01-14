import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import authRoutes from "./auth";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  refreshToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() }
}));
const verifyPasswordMock = vi.hoisted(() => vi.fn());
const hashPasswordMock = vi.hoisted(() => vi.fn(async () => "hashed"));
const signRefreshTokenMock = vi.hoisted(() => vi.fn(() => "refresh-token"));
const verifyJwtMock = vi.hoisted(() => vi.fn(() => ({ sub: "user-1" })));
const verifyGoogleIdTokenMock = vi.hoisted(() => vi.fn());
const totpVerifyMock = vi.hoisted(() => vi.fn());
const generateSecretMock = vi.hoisted(() =>
  vi.fn(() => ({ base32: "SECRET", otpauth_url: "otpauth://secret" }))
);

vi.mock("../config", () => ({
  config: {
    DATABASE_URL: "postgres://test",
    REDIS_URL: "redis://localhost:6379",
    QUEUE_PREFIX: "test",
    AI_SERVICE_URL: "http://localhost:8000",
    JWT_SECRET: "secret",
    API_PORT: 4000,
    API_HOST: "0.0.0.0",
    CORS_ORIGIN: "*",
    LOG_LEVEL: "info",
    CHAIN_RPC_URL: "http://localhost:8545",
    CHAIN_ID: 31337,
    CHAIN_DEPLOYMENT: "local",
    TOKEN_ADDRESS: "0x0",
    TOKEN_DECIMALS: 18,
    TOKEN_MIN_BALANCE: "0",
    PREMIUM_PASS_ADDRESS: "0x0",
    REWARDS_CONTRACT_ADDRESS: "0x0",
    REWARD_TOKEN_SYMBOL: "CTT",
    REWARD_EPOCH_MINUTES: 60,
    ACT_PRICE_PER_CALL: "1",
    ACT_ACCESS_PERIOD_MINUTES: 60,
    ACT_TREASURY_ADDRESS: "0x0",
    RATE_LIMIT_MAX: 1000,
    RATE_LIMIT_WINDOW: 60000,
    KYC_PROVIDER: "stub",
    MULTICHAIN_JSON: "[]",
    isProduction: false,
    isTest: true,
    corsOrigins: "*",
    logLevel: "info"
  }
}));

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../auth/password", () => ({ verifyPassword: verifyPasswordMock, hashPassword: hashPasswordMock }));
vi.mock("../auth/jwt", () => ({
  buildAuthResponse: (user: any) => ({ token: "token", user }),
  signRefreshToken: signRefreshTokenMock,
  verifyJwt: verifyJwtMock
}));
vi.mock("../auth/oauth", () => ({ verifyGoogleIdToken: verifyGoogleIdTokenMock }));
vi.mock("speakeasy", () => {
  const mod = {
    totp: { verify: () => totpVerifyMock() },
    generateSecret: () => generateSecretMock()
  };
  return { ...mod, default: mod };
});

describe("auth routes", () => {
  const buildApp = async () => {
    const app = Fastify();
    await app.register(authRoutes);
    await app.ready();
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      passwordHash: "hashed",
      totpSecret: null,
      isTotpEnabled: false,
      walletAddress: null
    });
    prismaMock.user.update.mockResolvedValue({});
    verifyPasswordMock.mockResolvedValue(true);
    prismaMock.refreshToken.create.mockResolvedValue({
      token: "refresh-token",
      expiresAt: new Date(Date.now() + 3600 * 1000)
    });
    prismaMock.refreshToken.update.mockResolvedValue({});
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    prismaMock.user.update.mockResolvedValue({});
    verifyGoogleIdTokenMock.mockResolvedValue({ email: "g@test.com" });
    totpVerifyMock.mockReturnValue(true);
  });

  it("registers a new user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "u1", email: "a@b.com", walletAddress: null });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "a@b.com", password: "pw" }
    });
    expect(res.statusCode).toBe(200);
    expect(hashPasswordMock).toHaveBeenCalled();
    expect(signRefreshTokenMock).toHaveBeenCalled();
  });

  it("rejects duplicate registration", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com" });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "a@b.com", password: "pw" }
    });
    expect(res.statusCode).toBe(409);
  });

  it("logs in with valid credentials", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: "hashed" });
    verifyPasswordMock.mockResolvedValue(true);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "a@b.com", password: "pw" }
    });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.refreshToken.create).toHaveBeenCalled();
  });

  it("rejects invalid password", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: "hashed" });
    verifyPasswordMock.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "a@b.com", password: "pw" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("requires totp when enabled", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      passwordHash: "hashed",
      isTotpEnabled: true,
      totpSecret: "SECRET"
    });
    verifyPasswordMock.mockResolvedValue(true);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "a@b.com", password: "pw" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid totp code", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      passwordHash: "hashed",
      isTotpEnabled: true,
      totpSecret: "SECRET"
    });
    verifyPasswordMock.mockResolvedValue(true);
    totpVerifyMock.mockReturnValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "a@b.com", password: "pw", totp: "123456" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("handles oauth success", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: "u1", email: "g@test.com" });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/oauth/google",
      payload: { idToken: "token" }
    });
    expect(res.statusCode).toBe(200);
    expect(verifyGoogleIdTokenMock).toHaveBeenCalled();
  });

  it("rejects oauth on invalid token", async () => {
    verifyGoogleIdTokenMock.mockRejectedValue(new Error("bad token"));
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/oauth/google",
      payload: { idToken: "token" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("refreshes token and revokes old one", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      token: "old",
      userId: "u1",
      expiresAt: new Date(Date.now() + 1000),
      revokedAt: null
    });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", walletAddress: null });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "old" }
    });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.refreshToken.create).toHaveBeenCalled();
    expect(prismaMock.refreshToken.update).toHaveBeenCalled();
  });

  it("rejects invalid refresh token", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: "bad" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("starts totp setup", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", totpSecret: null });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/totp/setup",
      headers: { authorization: "Bearer token" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().otpauthUrl).toBeDefined();
  });

  it("rejects invalid totp enable code", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", totpSecret: "SECRET" });
    totpVerifyMock.mockReturnValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/totp/enable",
      headers: { authorization: "Bearer token" },
      payload: { code: "111111" }
    });
    expect(res.statusCode).toBe(400);
  });
});
