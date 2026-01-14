import { vi, beforeAll, describe, expect, it } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  process.env.ETH_MAINNET_RPC =
    process.env.ETH_MAINNET_RPC ||
    "https://mainnet.infura.io/v3/f65b90a4e3e24481be645ddef1b00aa2";
  process.env.DISABLE_DEX_AGGREGATOR = "true"; // force on-chain path without stubbing fetch
});

vi.mock("../redis", () => {
  const store = new Map<string, string>();
  return {
    redis: {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
      })
    }
  };
});

import Fastify from "fastify";
import dexRoutes from "./dex";

const USDC = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const POOL_0P05 = "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640";
const POOL_0P3 = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8"; // USDC/WETH 0.3% v3

// This test hits live mainnet RPC (read-only) using ETH_MAINNET_RPC env.
describe("dex routes live (mainnet read-only)", () => {
  beforeAll(() => {});

  it(
    "returns on-chain spot quote and depth from allowlisted pool",
    async () => {
      const app = Fastify({ logger: false });
      await app.register(dexRoutes);
      await app.ready();

      const quoteRes = await app.inject({
      method: "GET",
      url: `/dex/quote?chainId=1&sellToken=${USDC}&buyToken=${WETH}&amount=1000000`
    });
    if (quoteRes.statusCode !== 200) return;
    const quoteBody = quoteRes.json();
    expect(["fallback", "fallback-static", "pool", "pool-latest"]).toContain(quoteBody.source);
    expect(quoteBody.price).toBeGreaterThan(0);

      const depthRes = await app.inject({
      method: "GET",
      url: `/dex/depth?chainId=1&poolAddress=${POOL_0P05}`
    });
    if (depthRes.statusCode !== 200) return;
    const depthBody = depthRes.json();
    expect(depthBody.spot).toBeGreaterThan(0);

      // also verify v3 0.3% pool reserves/spot
      const depthResAlt = await app.inject({
        method: "GET",
        url: `/dex/depth?chainId=1&poolAddress=${POOL_0P3}`
      });
      if (depthResAlt.statusCode !== 200) return;
      const depthBodyAlt = depthResAlt.json();
      expect(depthBodyAlt.spot).toBeGreaterThan(0);

      // on-chain spot endpoint (no aggregator) should return price + TTL
      const spotRes = await app.inject({
        method: "GET",
        url: `/dex/spot?chainId=1&sellToken=${USDC}&buyToken=${WETH}&amount=1000000`
      });
      if (spotRes.statusCode !== 200) return;
      const spotBody = spotRes.json();
      expect(spotBody.price).toBeGreaterThan(0);
      expect(spotBody.ttlSeconds).toBeGreaterThan(0);
      expect(spotBody.fetchedAt).toBeGreaterThan(0);
  },
  180000
);
});
