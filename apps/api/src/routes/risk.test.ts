import Fastify from "fastify";
import { describe, it, expect } from "vitest";
import riskRoutes from "./risk";

describe("risk routes", () => {
  const buildApp = async () => {
    const app = Fastify();
    await app.register(riskRoutes);
    await app.ready();
    return app;
  };

  it("computes volatility and var", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/risk/metrics",
      payload: { prices: [100, 102, 101, 103, 105], percentile: 0.95 }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.volatility).toBeGreaterThan(0);
    expect(typeof body.var).toBe("number");
  });

  it("checks liquidation alert", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/risk/alerts",
      payload: { prices: [100, 120, 80], liquidationThresholdPct: 0.3 }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().triggered).toBe(true);
  });

  it("returns pnl timeline", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/risk/pnl",
      payload: { points: [{ timestamp: 1, pnl: 10 }, { timestamp: 2, pnl: -5 }] }
    });
    const body = res.json();
    expect(body.timeline[1].cumulative).toBe(5);
  });
});
