import { describe, it, expect, vi, beforeEach } from "vitest";

describe("kyc provider selection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("../db", () => ({
      prisma: {
        kycVerification: {
          findFirst: vi.fn(async () => null),
          upsert: vi.fn(async () => ({})),
          updateMany: vi.fn(async () => ({}))
        }
      }
    }));
  });

  it("uses stub provider by default", async () => {
    process.env.KYC_PROVIDER = "stub";
    const mod = await import("./provider");
    const res = await mod.provider.start("u1");
    expect(res.status).toBe("pending");
  });

  it("uses manual provider when configured", async () => {
    process.env.KYC_PROVIDER = "manual";
    const mod = await import("./provider");
    const res = await mod.provider.start("u2");
    expect(res.status).toBe("pending");
  });
});
