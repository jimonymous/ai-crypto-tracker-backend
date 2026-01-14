import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import path from "path";
import { spawn, execFileSync } from "child_process";
import fs from "fs";

const HARDHAT_RPC = "http://127.0.0.1:8545";
const HARDHAT_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // hardhat default #0

// __dirname ≈ <repo>/apps/api/src; go up to repo root
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..", "..");
const HARDHAT_CLI = path.resolve(ROOT_DIR, "node_modules", "hardhat", "internal", "cli", "cli.js");
const NODE_BIN =
  ["/usr/bin/node", "/bin/node", process.execPath].find((p) => p && fs.existsSync(p)) ?? "node";
const CHAIN_DIR = path.join(ROOT_DIR, "apps", "chain");

const prismaMock = vi.hoisted(() => ({
  rewardAccrual: {
    findMany: vi.fn(),
    update: vi.fn()
  },
  onchainReceipt: {
    create: vi.fn()
  }
}));

vi.mock("../db", () => ({ prisma: prismaMock }));

vi.mock("../config", () => ({
  config: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://test",
    REDIS_URL: "redis://localhost:6379",
    QUEUE_PREFIX: "test",
    AI_SERVICE_URL: "http://localhost:8000",
    JWT_SECRET: "secret",
    API_PORT: 4000,
    API_HOST: "0.0.0.0",
    CORS_ORIGIN: "*",
    LOG_LEVEL: "info",
    CHAIN_RPC_URL: HARDHAT_RPC,
    CHAIN_ID: 31337,
    CHAIN_DEPLOYMENT: "localhost",
    TOKEN_ADDRESS: "0x0000000000000000000000000000000000000000",
    TOKEN_DECIMALS: 18,
    TOKEN_MIN_BALANCE: "0",
    PREMIUM_PASS_ADDRESS: "0x0000000000000000000000000000000000000000",
    REWARDS_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
    CHAIN_PRIVATE_KEY: HARDHAT_PK,
    REWARD_TOKEN_SYMBOL: "CTT",
    REWARD_EPOCH_MINUTES: 60,
    ACT_PRICE_PER_CALL: "1",
    ACT_ACCESS_PERIOD_MINUTES: 60,
    OAUTH_GOOGLE_CLIENT_ID: undefined,
    ACT_TREASURY_ADDRESS: "0x0000000000000000000000000000000000000000",
    RATE_LIMIT_MAX: 1000,
    RATE_LIMIT_WINDOW: 60000,
    KYC_PROVIDER: "stub",
    MULTICHAIN_JSON: "[]",
    isProduction: false,
    isTest: true,
    corsOrigins: "*",
    logLevel: "info"
  }
}));

describe("publishRewardsEpoch (hardhat integration)", () => {
  let node: any;
  let spawnedNode = false;

  const waitForRpc = async (timeoutMs = 60000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(HARDHAT_RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] })
        });
        if (res.ok) {
          const body = await res.json();
          if (body?.result) return;
        }
      } catch {
        /* ignore until timeout */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("hardhat node start timeout");
  };

  const startNode = async () => {
    // If a node is already running (user-kept), reuse it
    try {
      await waitForRpc(10_000);
      return;
    } catch {
      /* fall through */
    }

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(NODE_BIN, [HARDHAT_CLI, "node", "--hostname", "127.0.0.1", "--port", "8545"], {
        cwd: CHAIN_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PATH: `${path.join(ROOT_DIR, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`
        }
      });
      node = proc;
      spawnedNode = true;
      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code && code !== 0) reject(new Error(`hardhat node exited ${code}`));
      });
      waitForRpc().then(resolve).catch(reject);
    });
  };

  beforeAll(
    async () => {
      process.env.CHAIN_PRIVATE_KEY = HARDHAT_PK;
      process.env.CHAIN_RPC_URL = HARDHAT_RPC;
      process.env.CHAIN_DEPLOYMENT = "localhost";
      process.env.CHAIN_ID = "31337";
      process.env.DATABASE_URL = "postgres://test";
      await startNode();
      if (spawnedNode) {
        execFileSync(NODE_BIN, [HARDHAT_CLI, "run", "scripts/deploy.ts", "--network", "localhost"], {
          cwd: CHAIN_DIR,
          stdio: "ignore",
          env: {
            ...process.env,
            PATH: `${path.join(ROOT_DIR, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`
          }
        });
      }
      prismaMock.rewardAccrual.findMany.mockResolvedValue([
        {
          id: "acc1",
          cycle: "1",
          amount: 100n,
          status: "pending",
          user: { walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" }
        }
      ]);
      prismaMock.rewardAccrual.update.mockResolvedValue({});
      prismaMock.onchainReceipt.create.mockResolvedValue({});
    },
    90000
  );

  afterAll(async () => {
    if (spawnedNode && node && !node.killed) {
      node.kill();
      await new Promise((resolve) => node?.once("exit", resolve));
    }
  });

  it(
    "publishes merkle root on hardhat chain",
    async () => {
      const { publishRewardsEpoch } = await import("./publish");
      const res = await publishRewardsEpoch("1");
      expect(res.txHash).toBeDefined();
      expect(prismaMock.rewardAccrual.update).toHaveBeenCalled();
      expect(prismaMock.onchainReceipt.create).toHaveBeenCalled();
    },
    120000
  );
});
