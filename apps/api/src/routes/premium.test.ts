import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import premiumRoutes from "./premium";

const getPremiumStatusMock = vi.hoisted(() => vi.fn());

vi.mock("../chain/gating", () => ({
  getPremiumStatus: (...args: unknown[]) => getPremiumStatusMock(...args)
}));

describe("premium/status", () => {
  const buildApp = async () => {
    const app = Fastify();
    await app.register(premiumRoutes);
    await app.ready();
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getPremiumStatusMock.mockResolvedValue({ eligible: true, missing: [] });
  });

  it("requires address", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/premium/status" });
    expect(res.statusCode).toBe(400);
  });

  it("returns status and handles invalid chain", async () => {
    getPremiumStatusMock.mockImplementation(() => {
      throw new Error("Invalid chain");
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/premium/status?address=0xabc&chainId=99999" });
    expect(res.statusCode).toBe(400);
  });
});
