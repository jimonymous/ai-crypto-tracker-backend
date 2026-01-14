import Fastify from "fastify";
import { describe, it, expect, beforeEach, vi } from "vitest";
import complianceRoutes from "./compliance";
import { signJwt } from "../auth/jwt";
import { decryptString } from "../security/encryption";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  kycVerification: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn()
  }
}));

const providerMock = vi.hoisted(() => ({
  start: vi.fn(),
  verify: vi.fn(),
  status: vi.fn()
}));

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../compliance/provider", () => ({ provider: providerMock }));

describe("compliance routes security/PII", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.JWT_SECRET = "test-secret";
    process.env.PII_ENCRYPTION_KEY = "super-strong-pii-key-12345";
    prismaMock.user.findUnique.mockReset();
    prismaMock.kycVerification.upsert.mockReset();
    providerMock.start.mockReset();
  });

  it("encrypts stored KYC references", async () => {
    providerMock.start.mockResolvedValue({ status: "pending", reference: "plain-ref" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });
    prismaMock.kycVerification.upsert.mockImplementation(async (args: any) => ({
      status: args.update?.status ?? args.create?.status,
      provider: args.create?.provider ?? "stub",
      reference: args.update?.reference ?? args.create?.reference
    }));

    const app = Fastify();
    await app.register(complianceRoutes);
    const token = signJwt({ sub: "user-1" });
    const res = await app.inject({
      method: "POST",
      url: "/compliance/kyc/start",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(200);
    const call = prismaMock.kycVerification.upsert.mock.calls[0][0];
    const storedRef = call.update?.reference ?? call.create?.reference;
    expect(storedRef).not.toBe("plain-ref");
    expect(decryptString(storedRef)).toBe("plain-ref");
  });

  it("rejects when encryption key is missing or weak", async () => {
    process.env.PII_ENCRYPTION_KEY = "short";
    providerMock.start.mockResolvedValue({ status: "pending", reference: "plain-ref" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });

    const app = Fastify();
    await app.register(complianceRoutes);
    const token = signJwt({ sub: "user-1" });
    const res = await app.inject({
      method: "POST",
      url: "/compliance/kyc/start",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(res.statusCode).toBe(500);
    expect(prismaMock.kycVerification.upsert).not.toHaveBeenCalled();
  });
});
