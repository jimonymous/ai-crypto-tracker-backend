import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import alertsRoutes from "./alerts";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  alert: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
}));

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../auth/jwt", () => ({ verifyJwt: vi.fn(() => ({ sub: "user-1" })) }));

describe("alerts routes", () => {
  const buildApp = async () => {
    const app = Fastify();
    await app.register(alertsRoutes);
    await app.ready();
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-1" });
    prismaMock.alert.findMany.mockResolvedValue([]);
    prismaMock.alert.create.mockResolvedValue({ id: "a1" });
    prismaMock.alert.update.mockResolvedValue({ id: "a1" });
    prismaMock.alert.delete.mockResolvedValue({});
  });

  it("creates alert", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/alerts",
      headers: { authorization: "Bearer token" },
      payload: { userId: "u1", marketId: "m1", type: "price_above", threshold: 100, timeframe: "1h" }
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects invalid payload", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/alerts",
      headers: { authorization: "Bearer token" },
      payload: { userId: "u1", marketId: "m1", type: "price_above" } // missing threshold
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects delete without auth", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "DELETE", url: "/alerts/a1" });
    expect(res.statusCode).toBe(401);
  });

  it("lists alerts", async () => {
    prismaMock.alert.findMany.mockResolvedValue([{ id: "a1" }]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/alerts?userId=u1", headers: { authorization: "Bearer token" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].id).toBe("a1");
  });
});
