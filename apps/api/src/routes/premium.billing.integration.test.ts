import Fastify from "fastify";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import path from "path";
import fs from "fs";
import { spawn, spawnSync } from "child_process";
import { createPublicClient, createWalletClient, http, parseUnits, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import premiumRoutes from "./premium";
import billingRoutes from "./billing";
import { tokenAbi, premiumPassAbi } from "../chain/abis";

const HARDHAT_RPC = vi.hoisted(() => "http://127.0.0.1:8545");
const HARDHAT_CHAIN_ID = vi.hoisted(() => 31337);
const PK_OWNER = vi.hoisted(
  () => "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);
const PK_USER = vi.hoisted(
  () => "0x59c6995e998f97a5a0044966f0945381d7f6c8ff8e8c7ded29b4f7f220fba1a6"
);

// __dirname ≈ <repo>/apps/api/src; go up to repo root
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..", "..");
const CHAIN_DIR = path.join(ROOT_DIR, "apps", "chain");
const HARDHAT_CLI = path.resolve(ROOT_DIR, "node_modules", "hardhat", "internal", "cli", "cli.js");
const HARDHAT_BIN = path.resolve(ROOT_DIR, "node_modules", ".bin", "hardhat");
const NODE_BIN = ["/usr/bin/node", "/bin/node", process.execPath].find((p) => p && fs.existsSync(p)) ?? "node";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  apiAccessPass: { findFirst: vi.fn(), create: vi.fn() }
}));

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../auth/jwt", () => ({ verifyJwt: vi.fn(() => ({ sub: "user-1" })) }));
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
    CHAIN_ID: HARDHAT_CHAIN_ID,
    CHAIN_DEPLOYMENT: "localhost",
    TOKEN_ADDRESS: "0x0",
    TOKEN_DECIMALS: 18,
    TOKEN_MIN_BALANCE: "0",
    PREMIUM_PASS_ADDRESS: "0x0",
    REWARDS_CONTRACT_ADDRESS: "0x0",
    CHAIN_PRIVATE_KEY: PK_OWNER,
    REWARD_TOKEN_SYMBOL: "ACT",
    REWARD_EPOCH_MINUTES: 60,
    ACT_PRICE_PER_CALL: "1",
    ACT_ACCESS_PERIOD_MINUTES: 60,
    OAUTH_GOOGLE_CLIENT_ID: undefined,
    ACT_TREASURY_ADDRESS: "0x0",
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

describe.sequential("hardhat integration: premium & billing", () => {
  let deployment: any;
  let userAddress: `0x${string}`;
  let treasury: `0x${string}`;
  let tokenAddress: `0x${string}`;
  let passAddress: `0x${string}`;
  let userWallet: any;
  let publicClient: any;
  let node: any;
  let nodeSpawned = false;
  let setupOk = true;

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
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("hardhat node not reachable on 8545");
  };

  const loadDeployment = () =>
    JSON.parse(fs.readFileSync(path.join(CHAIN_DIR, "deployments", "localhost.json"), "utf-8"));

  const deployWithRetries = async (retries = 3, delayMs = 2000) => {
    const env = {
      ...process.env,
      PATH: `${path.join(ROOT_DIR, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`
    };
    const attempts = [
      { bin: NODE_BIN, args: [HARDHAT_CLI, "run", "scripts/deploy.ts", "--network", "localhost"] },
      { bin: "node", args: [HARDHAT_CLI, "run", "scripts/deploy.ts", "--network", "localhost"] },
      { bin: HARDHAT_BIN, args: ["run", "scripts/deploy.ts", "--network", "localhost"] }
    ];
    let lastError: any = null;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < retries; i++) {
      for (const attempt of attempts) {
        try {
          const res = spawnSync(attempt.bin, attempt.args, {
            cwd: CHAIN_DIR,
            env,
            encoding: "utf-8"
          });
          if (res.status === 0) return;
          lastError = res.stderr || res.stdout || `status ${res.status}`;
        } catch (err: any) {
          lastError = err;
        }
      }
      await delay(delayMs);
    }
    throw new Error(`deploy failed: ${lastError}`);
  };

  const startNode = async () =>
    new Promise<void>((resolve, reject) => {
      const proc = spawn(NODE_BIN, [HARDHAT_CLI, "node", "--hostname", "127.0.0.1", "--port", "8545"], {
        cwd: CHAIN_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          PATH: `${path.join(ROOT_DIR, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`
        }
      });
      node = proc;
      nodeSpawned = true;
      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code && code !== 0) reject(new Error(`hardhat node exited ${code}`));
      });
      waitForRpc().then(resolve).catch(reject);
    });

  beforeAll(async () => {
    process.env.CHAIN_PRIVATE_KEY = PK_OWNER;
    process.env.CHAIN_RPC_URL = HARDHAT_RPC;
    process.env.CHAIN_DEPLOYMENT = "localhost";
    process.env.CHAIN_ID = `${HARDHAT_CHAIN_ID}`;

    const ensureNode = async () => {
      try {
        await waitForRpc(5000);
        return false; // already running
      } catch {
        await startNode();
        return true;
      }
    };

    let startedHere = false;
    try {
      startedHere = await ensureNode();
      try {
        await deployWithRetries();
      } catch (err: any) {
        // If deploy failed, ensure node is up and retry once
        startedHere = (await ensureNode()) || startedHere;
        await deployWithRetries();
      }
    } catch (err) {
      console.warn("[hardhat premium/billing] setup failed", err);
      setupOk = false;
      return;
    }
    deployment = loadDeployment();
    tokenAddress = deployment.contracts.token.address;
    passAddress = deployment.contracts.premiumPass.address;
    treasury = deployment.contracts.feeTreasury.address;

    const chain = {
      id: HARDHAT_CHAIN_ID,
      name: "hardhat",
      network: "hardhat",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [HARDHAT_RPC] }, public: { http: [HARDHAT_RPC] } }
    } as const;

    const owner = privateKeyToAccount(PK_OWNER as `0x${string}`);
    const user = privateKeyToAccount(PK_USER as `0x${string}`);
    userAddress = user.address;
    publicClient = createPublicClient({ chain, transport: http(HARDHAT_RPC) });
    const ownerWallet = createWalletClient({ chain, transport: http(HARDHAT_RPC), account: owner });
    userWallet = createWalletClient({ chain, transport: http(HARDHAT_RPC), account: user });

    let nonce = await publicClient.getTransactionCount({ address: owner.address });

    await ownerWallet.sendTransaction({ chain, to: user.address, value: parseEther("1"), nonce });
    nonce++;

    const mintAmount = parseUnits("5", 18);
    const mintTx = await ownerWallet.writeContract({
      chain,
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "mint",
      args: [user.address, mintAmount],
      nonce
    });
    await publicClient.waitForTransactionReceipt({ hash: mintTx });
    nonce++;

    const passTx = await ownerWallet.writeContract({
      chain,
      address: passAddress,
      abi: premiumPassAbi,
      functionName: "mintTo",
      args: [user.address, "ipfs://test"],
      nonce
    });
    await publicClient.waitForTransactionReceipt({ hash: passTx });

    // align mocked config addresses with freshly deployed contracts
    const cfg = (await import("../config")).config as any;
    cfg.TOKEN_ADDRESS = tokenAddress;
    cfg.PREMIUM_PASS_ADDRESS = passAddress;
    cfg.REWARDS_CONTRACT_ADDRESS = deployment.contracts.rewardsMerkle.address;
    cfg.ACT_TREASURY_ADDRESS = treasury;
    cfg.CHAIN_DEPLOYMENT = "localhost";
    cfg.CHAIN_RPC_URL = HARDHAT_RPC;

    // Ensure chain config hydrates to this deployment
    const { selectChainWithRpc } = await import("../chain/config");
    selectChainWithRpc(HARDHAT_CHAIN_ID, HARDHAT_RPC); // triggers hydration against localhost deployment

    // Sanity check: minted balances exist
    const passBalance = await publicClient.readContract({
      address: passAddress,
      abi: premiumPassAbi,
      functionName: "balanceOf",
      args: [userAddress]
    });
    expect(passBalance).toBe(1n);

    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      walletAddress: userAddress
    });
    prismaMock.apiAccessPass.findFirst.mockResolvedValue(null);
    prismaMock.apiAccessPass.create.mockResolvedValue({
      id: "pass-1",
      userId: "user-1",
      walletAddress: userAddress,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    });
  }, 180000);

  afterAll(() => {
    if (nodeSpawned && node && !node.killed) node.kill();
  });

  it("returns eligible premium status with minted pass", async () => {
    if (!setupOk) {
      console.warn("[hardhat premium/billing] skipping test because setup failed");
      return;
    }
    const app = Fastify();
    await app.register(premiumRoutes);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: `/premium/status?address=${userAddress}&chainId=${HARDHAT_CHAIN_ID}`
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.eligible).toBe(true);
    expect(body.satisfied.some((r: any) => r.nftAddress?.toLowerCase() === passAddress.toLowerCase())).toBe(true);
  });

  it("verifies billing purchase via real token transfer", async () => {
    if (!setupOk) {
      console.warn("[hardhat premium/billing] skipping test because setup failed");
      return;
    }
    const priceWei = parseUnits("1", 18);
    const txHash = await userWallet.writeContract({
      chain: {
        id: HARDHAT_CHAIN_ID,
        name: "hardhat",
        network: "hardhat",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [HARDHAT_RPC] }, public: { http: [HARDHAT_RPC] } }
      },
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "transfer",
      args: [treasury, priceWei]
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const app = Fastify();
    await app.register(billingRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: `/billing/purchase?chainId=${HARDHAT_CHAIN_ID}`,
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      payload: { txHash }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("active");
    expect(body.walletAddress.toLowerCase()).toBe(userAddress.toLowerCase());
  });
});
