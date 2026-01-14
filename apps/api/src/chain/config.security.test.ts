import { describe, it, expect, beforeEach, vi } from "vitest";

describe("chain config rpc override sanitization", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgres://test";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.JWT_SECRET = "secret";
    process.env.CHAIN_RPC_URL = "http://localhost:8545";
    process.env.CHAIN_ID = "31337";
    process.env.CHAIN_DEPLOYMENT = "local";
  });

  it("ignores invalid rpcUrl schemes", async () => {
    const { selectChainWithRpc } = await import("./config");
    const chain = selectChainWithRpc(31337, "ftp://malicious");
    expect(chain.rpcUrl).toBe("http://localhost:8545");
  });

  it("falls back to default chain when chainId is invalid", async () => {
    const { selectChainWithRpc, chainConfig } = await import("./config");
    const chain = selectChainWithRpc(Number("not-a-number"), "http://example.com");
    expect(chain.id).toBe(chainConfig.id);
    expect(chain.rpcUrl).toBe(chainConfig.rpcUrl);
  });

  it("rejects rpcUrl host not in allowlist even when scheme is valid", async () => {
    const { selectChainWithRpc, chainConfig } = await import("./config");
    const chain = selectChainWithRpc(31337, "http://not-allowed.example.com");
    expect(chain.rpcUrl).toBe(chainConfig.rpcUrl);
  });

  it("allows rpcUrl override when hostname matches configured chain host", async () => {
    const { selectChainWithRpc } = await import("./config");
    const chain = selectChainWithRpc(31337, "http://localhost:9999/custom");
    expect(chain.rpcUrl.startsWith("http://localhost:9999/custom")).toBe(true);
  });
});
