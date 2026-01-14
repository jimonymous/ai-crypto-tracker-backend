import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import walletRoutes from "./wallet";

const makePublicClientMock = vi.hoisted(() =>
  vi.fn((..._args: any[]) => ({ readContract: vi.fn().mockRejectedValue(new Error("fail")) }))
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

describe("wallet/balances error paths", () => {
  it("returns 400 on invalid address", async () => {
    const app = Fastify();
    await app.register(walletRoutes);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/wallet/balances?address=notanaddress" });
    expect(res.statusCode).toBe(400);
  });

  it("returns balances even if readContract fails", async () => {
    const app = Fastify();
    await app.register(walletRoutes);
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/wallet/balances?address=0x0000000000000000000000000000000000000005&rpcUrl=invalid"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.balances[0].error).toBe("failed");
  });
});
