import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import rewardsRoutes from "./rewards";

const prismaMock = vi.hoisted(() => ({
  onchainReceipt: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  rewardAccrual: { findFirst: vi.fn(), findMany: vi.fn() }
}));

const selectChainWithRpcMock = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../chain/config", () => ({
  selectChainWithRpc: (...args: unknown[]) => selectChainWithRpcMock(...args)
}));

describe("rewardsRoutes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    selectChainWithRpcMock.mockReturnValue({
      id: 99,
      chainId: 99,
      token: { address: "0x01", decimals: 18 },
      rewards: { address: "0x02" }
    });
    prismaMock.onchainReceipt.findFirst.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      walletAddress: "0x0000000000000000000000000000000000000001"
    });
    prismaMock.rewardAccrual.findFirst.mockResolvedValue({
      cycle: "1",
      amount: 100n,
      token: "ACT",
      status: "claimable",
      merkleProof: [],
      claimableAt: new Date(),
      expiresAt: null
    });
  });

  const buildApp = async () => {
    const app = Fastify();
    await app.register(rewardsRoutes);
    await app.ready();
    return app;
  };

  it("returns latest epoch metadata with requested chain", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/rewards/epoch/latest?chainId=99" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chainId).toBe(99);
    const call = selectChainWithRpcMock.mock.calls[0];
    expect(call[0]).toBe(99);
  });

  it("uses selected chain addresses in proof response", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/rewards/proof?address=0x0000000000000000000000000000000000000001&epoch=1&chainId=99"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contract).toBe("0x02");
    expect(body.tokenAddress).toBe("0x01");
  });
});
