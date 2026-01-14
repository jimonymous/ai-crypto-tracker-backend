import { vi, describe, it, expect } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  process.env.ETH_MAINNET_RPC =
    process.env.ETH_MAINNET_RPC ||
    "https://mainnet.infura.io/v3/f65b90a4e3e24481be645ddef1b00aa2";
  process.env.POLYGON_MAINNET_RPC =
    process.env.POLYGON_MAINNET_RPC ||
    "https://polygon-mainnet.infura.io/v3/f65b90a4e3e24481be645ddef1b00aa2";
});

import Fastify from "fastify";
import walletRoutes from "./wallet";
import { getDexChain } from "../dex/config";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("wallet live balances (mainnet)", () => {
  it(
    "fetches WETH balance via mainnet RPC",
    async () => {
      process.env.WALLET_TOKEN_LIST = `${WETH}:WETH:18`;
      const app = Fastify({ logger: false });
      await app.register(walletRoutes);
      await app.ready();

      const res = await app.inject({
        method: "GET",
        url: `/wallet/balances?address=${VITALIK}&chainId=1&rpcUrl=${encodeURIComponent(
          process.env.ETH_MAINNET_RPC!
        )}`
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.address.toLowerCase()).toBe(VITALIK.toLowerCase());
      const weth = body.balances.find((b: any) => b.address.toLowerCase() === WETH.toLowerCase());
      expect(weth).toBeTruthy();
      expect(BigInt(weth.balance)).toBeGreaterThan(0n);
    },
    180000
  );
});

describe("wallet live balances (polygon)", () => {
  // Use the deep-liquidity Uniswap v3 USDC.e/WETH 0.05% pool on Polygon
  const POLY_WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
  const POLY_USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e
  const poolWethUsdc = "0x45dda9cb7c25131df268515131f647d726f50608";

  it(
    "fetches Polygon WETH/USDC balances via Polygon RPC",
    async () => {
      process.env.WALLET_TOKEN_LIST = `${POLY_WETH}:WETH:18,${POLY_USDC}:USDC:6`;
      const app = Fastify({ logger: false });
      await app.register(walletRoutes);
      await app.ready();

      const res = await app.inject({
        method: "GET",
        url: `/wallet/balances?address=${poolWethUsdc}&chainId=137&rpcUrl=${encodeURIComponent(
          process.env.POLYGON_MAINNET_RPC!
        )}`
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const weth = body.balances.find((b: any) => b.address.toLowerCase() === POLY_WETH.toLowerCase());
      const usdc = body.balances.find((b: any) => b.address.toLowerCase() === POLY_USDC.toLowerCase());
      expect(weth).toBeTruthy();
      expect(usdc).toBeTruthy();
      // Require non-zero balances for this heavily used pool
      expect(BigInt(weth.balance)).toBeGreaterThan(0n);
      expect(BigInt(usdc.balance)).toBeGreaterThan(0n);
    },
    180000
  );
});
