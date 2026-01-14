import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import dexCandlesRoutes from "./dexCandles";
import dexRoutes from "./dex";
import arbHistoryRoutes from "./arbHistory";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
});

describe("dex candles & arb history (on-chain)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds candles when poolAddress is provided", async () => {
    if (!process.env.ETH_MAINNET_RPC) {
      console.warn("ETH_MAINNET_RPC missing; skipping /dex/candles pool test");
      return;
    }
    const app = Fastify();
    await app.register(dexCandlesRoutes);
    await app.ready();

    // USDC/WETH 0.05% Uniswap v3 mainnet pool
    const pool = "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640";
    const res = await app.inject({
      method: "GET",
      url: `/dex/candles?chainId=1&poolAddress=${pool}&windowMinutes=2&intervalSeconds=30&minSamples=1&maxBlocks=50`
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.poolAddress.toLowerCase()).toBe(pool.toLowerCase());
    expect(body.candleCount).toBeGreaterThan(0);
  });

  it("returns pools for newly added chains", async () => {
    const chains = [56, 42161, 10, 8453, 43114];
    const app = Fastify();
    await app.register(dexRoutes);
    await app.ready();

    for (const chainId of chains) {
      const res = await app.inject({ method: "GET", url: `/dex/pools?chainId=${chainId}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.pools)).toBe(true);
      expect(body.pools.length).toBeGreaterThan(0);
    }
  });

  it("walks blocks and returns arb history samples", async () => {
    if (!process.env.ETH_MAINNET_RPC) {
      console.warn("ETH_MAINNET_RPC missing; skipping /arb/history test");
      return;
    }
    const app = Fastify();
    await app.register(arbHistoryRoutes);
    await app.ready();

    const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const usdc = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const usdt = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

    const res = await app.inject({
      method: "GET",
      url: `/arb/history?chainId=1&tokens=${weth},${usdc},${usdt}&windowMinutes=2&intervalSeconds=30&minProfitPct=-1`
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.events)).toBe(true);
    // should capture at least one block in the window
    expect(body.events.length).toBeGreaterThan(0);
    const evt = body.events[0];
    expect(evt.legs.length).toBe(3);
    expect(evt.legs[0]).toHaveProperty("price");
  });

  it("respects creationBlock guard when building blocks", async () => {
    if (!process.env.ETH_MAINNET_RPC) {
      console.warn("ETH_MAINNET_RPC missing; skipping creationBlock test");
      return;
    }
    const { buildBlockNumbers } = await import("../dex/candleBuilder");
    const rpc = process.env.ETH_MAINNET_RPC!;
    // use a small window and creationBlock near latest to minimize RPC
    const creationBlock = BigInt(19000000); // recent-ish mainnet block to bound search
    const { blocks } = await buildBlockNumbers(1, rpc, 1, 30, 50, creationBlock);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b >= creationBlock)).toBe(true);
  });
});
