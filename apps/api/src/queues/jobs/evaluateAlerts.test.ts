import { describe, expect, it, vi, beforeEach } from "vitest";
import { evaluateAlertsProcessor } from "./evaluateAlerts";

const prismaMock = vi.hoisted(() => ({
  alert: { findMany: vi.fn(), update: vi.fn() },
  candle: { findFirst: vi.fn() }
}));
const redisMock = vi.hoisted(() => ({
  publish: vi.fn()
}));

vi.mock("../../db", () => ({ prisma: prismaMock }));
vi.mock("../../redis", () => ({ redis: redisMock }));

describe("evaluateAlertsProcessor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.alert.findMany.mockResolvedValue([
      {
        id: "a1",
        userId: "u1",
        marketId: "m1",
        type: "price_above",
        status: "active",
        condition: { threshold: 2 }
      }
    ]);
    prismaMock.candle.findFirst.mockResolvedValue({
      close: 3
    });
    prismaMock.alert.update.mockResolvedValue({});
    redisMock.publish.mockResolvedValue(1);
  });

  it("triggers alerts and publishes", async () => {
    const result = await evaluateAlertsProcessor({ data: { marketId: "m1", timeframe: "1h" } } as any);
    expect(result).toMatchObject({ evaluated: 1, triggered: 1 });
    expect(redisMock.publish).toHaveBeenCalledWith(
      "alerts",
      expect.stringContaining("\"alertId\":\"a1\"")
    );
    expect(prismaMock.alert.update).toHaveBeenCalled();
  });

  it("skips when no alerts", async () => {
    prismaMock.alert.findMany.mockResolvedValue([]);
    const result = await evaluateAlertsProcessor({ data: { marketId: "m1", timeframe: "1h" } } as any);
    expect(result).toMatchObject({ evaluated: 0, triggered: 0 });
  });

  it("returns evaluated when no candle", async () => {
    prismaMock.candle.findFirst.mockResolvedValue(null);
    const result = await evaluateAlertsProcessor({ data: { marketId: "m1", timeframe: "1h" } } as any);
    expect(result).toMatchObject({ evaluated: 1, triggered: 0 });
  });
});
