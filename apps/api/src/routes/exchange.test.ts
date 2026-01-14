import Fastify from "fastify";
import { describe, it, expect, beforeEach, vi } from "vitest";
import exchangeRoutes from "./exchange";

const redisStore = new Map<string, string>();

vi.mock("../redis", () => ({
  redis: {
    set: async (k: string, v: string) => {
      redisStore.set(k, v);
    },
    get: async (k: string) => redisStore.get(k),
    rpush: async (k: string, v: string) => {
      const arr = JSON.parse(redisStore.get(k) || "[]") as string[];
      arr.push(v);
      redisStore.set(k, JSON.stringify(arr));
    },
    lrange: async (k: string) => {
      const arr = JSON.parse(redisStore.get(k) || "[]") as string[];
      return arr;
    }
  }
}));

vi.mock("../auth/jwt", () => ({
  verifyJwt: () => ({ sub: "user-1" })
}));

vi.mock("../exchange/binance", () => ({
  fetchBinanceBalances: vi.fn(async () => ({
    exchange: "binance",
    balances: { USDT: { free: 100, used: 0, total: 100 } }
  }))
}));

describe("exchange routes", () => {
  beforeEach(() => {
    redisStore.clear();
    process.env.PII_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
  });

  const buildApp = async () => {
    const app = Fastify();
    await app.register(exchangeRoutes);
    await app.ready();
    return app;
  };

  it("stores credentials and fetches binance balances", async () => {
    const app = await buildApp();
    const store = await app.inject({
      method: "POST",
      url: "/exchange/keys",
      headers: { authorization: "Bearer token" },
      payload: { exchange: "binance", apiKey: "k", secret: "s" }
    });
    expect(store.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: "/exchange/balances?exchange=binance",
      headers: { authorization: "Bearer token" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exchange).toBe("binance");
    expect(body.balances.USDT.total).toBe(100);
  });

  it("places and lists paper orders", async () => {
    const app = await buildApp();
    const orderRes = await app.inject({
      method: "POST",
      url: "/exchange/paper/orders",
      headers: { authorization: "Bearer token" },
      payload: { exchange: "paper", symbol: "BTC/USDT", side: "buy", type: "market", amount: 1 }
    });
    expect(orderRes.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: "/exchange/paper/orders",
      headers: { authorization: "Bearer token" }
    });
    const body = list.json();
    expect(body.orders.length).toBe(1);
    expect(body.orders[0].symbol).toBe("BTC/USDT");
  });

  it("rejects storing credentials when encryption key is weak", async () => {
    process.env.PII_ENCRYPTION_KEY = "short";
    const app = await buildApp();
    const store = await app.inject({
      method: "POST",
      url: "/exchange/keys",
      headers: { authorization: "Bearer token" },
      payload: { exchange: "binance", apiKey: "k", secret: "s" }
    });
    expect(store.statusCode).toBeGreaterThanOrEqual(400);
  });
});
