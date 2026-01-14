import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import walletRoutes from "./wallet";

const makePublicClientMock = vi.hoisted(() =>
  vi.fn((..._args: any[]) => ({
    readContract: vi.fn().mockResolvedValue(18)
  }))
);

vi.mock("../chain/publicClient", () => ({
  makePublicClient: () => makePublicClientMock()
}));
vi.mock("../chain/config", () => ({
  selectChainWithRpc: vi.fn(() => ({
    id: 1,
    name: "test",
    rpcUrl: "http://rpc",
    token: { address: "0x0000000000000000000000000000000000000001", decimals: 18 },
    premiumPass: { address: "0x0000000000000000000000000000000000000002" },
    rewards: { address: "0x0000000000000000000000000000000000000003" },
    treasury: "0x0000000000000000000000000000000000000004"
  }))
}));

describe("walletRoutes /wallet/balances", () => {
  const buildApp = async () => {
    const app = Fastify();
    await app.register(walletRoutes);
    await app.ready();
    return app;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid address", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/wallet/balances?address=notanaddress" });
    expect(res.statusCode).toBe(400);
  });

  it("returns balances for valid address", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/wallet/balances?address=0x0000000000000000000000000000000000000005&chainId=1"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.address).toBe("0x0000000000000000000000000000000000000005");
    expect(body.balances.length).toBeGreaterThan(0);
  });
});
