import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import billingRoutes from "./billing";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() }
}));

const verifyErc20TransferMock = vi.hoisted(() => vi.fn());
const ensureActiveAccessMock = vi.hoisted(() => vi.fn());
const selectChainWithRpcMock = vi.hoisted(() => vi.fn());
const makeWalletClientMock = vi.hoisted(() => vi.fn());
const attemptAutoChargeMock = vi.hoisted(() => vi.fn());
const waitForReceiptMock = vi.hoisted(() => vi.fn());
const writeContractMock = vi.hoisted(() => vi.fn());

vi.mock("../db", () => ({ prisma: prismaMock }));
vi.mock("../auth/jwt", () => ({ verifyJwt: vi.fn(() => ({ sub: "user-1" })) }));
vi.mock("../chain/verifyTransfer", () => ({ verifyErc20Transfer: verifyErc20TransferMock }));
vi.mock("../billing/accessPass", () => ({
  getPriceInfo: (chain: any) => ({
    token: "ACT",
    amount: "1",
    amountWei: "1000000000000000000",
    decimals: chain?.token?.decimals ?? 18,
    tokenAddress: chain?.token?.address ?? "0x01",
    periodMinutes: 60
  }),
  ensureActiveAccess: ensureActiveAccessMock
}));
vi.mock("../chain/config", () => ({
  selectChainWithRpc: (...args: unknown[]) => selectChainWithRpcMock(...args)
}));
vi.mock("../billing/charge", () => ({ attemptAutoCharge: attemptAutoChargeMock }));
vi.mock("../chain/publicClient", () => ({
  makeWalletClient: (...args: unknown[]) => makeWalletClientMock(...args),
  makePublicClient: () => ({
    waitForTransactionReceipt: waitForReceiptMock,
    readContract: vi.fn()
  })
}));
vi.mock("../chain/abis", () => ({ feeTreasuryAbi: [] }));

describe("billingRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      walletAddress: "0x0000000000000000000000000000000000000001"
    });
    verifyErc20TransferMock.mockResolvedValue(true);
    ensureActiveAccessMock.mockResolvedValue({ expiresAt: new Date(), walletAddress: "0xabc", periodMinutes: 60 });
    selectChainWithRpcMock.mockReturnValue({
      id: 99,
      chainId: 99,
      name: "testnet",
      rpcUrl: "http://rpc",
      token: { address: "0x0000000000000000000000000000000000000001", decimals: 18, minBalance: "0" },
      treasury: "0x0000000000000000000000000000000000000002",
      premiumPass: { address: "0x0000000000000000000000000000000000000003" },
      rewards: { address: "0x0000000000000000000000000000000000000004" }
    });
    makeWalletClientMock.mockReturnValue({ writeContract: writeContractMock });
    waitForReceiptMock.mockResolvedValue({});
    writeContractMock.mockReset();
    writeContractMock.mockResolvedValue("0xtx");
  });

  const buildApp = async () => {
    const app = Fastify();
    await app.register(billingRoutes);
    await app.ready();
    return app;
  };

  it("verifies tx hash on purchase with specified chainId", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/billing/purchase?chainId=99",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      payload: { txHash: "0xabc" }
    });

    expect(res.statusCode).toBe(200);
    expect(selectChainWithRpcMock).toHaveBeenCalledWith(99, undefined);
    expect(verifyErc20TransferMock).toHaveBeenCalled();
    const chainArg = verifyErc20TransferMock.mock.calls[0][1];
    expect(chainArg.id).toBe(99);
  });

  it("returns price info for provided chain", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/billing/price?chainId=77"
    });
    expect(res.statusCode).toBe(200);
    expect(selectChainWithRpcMock).toHaveBeenCalledWith(77, undefined);
    const body = res.json();
    expect(body.token).toBe("ACT");
  });

  it("returns 402 when tx verification fails", async () => {
    verifyErc20TransferMock.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/billing/purchase",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      payload: { txHash: "0xabc" }
    });
    expect(res.statusCode).toBe(402);
  });

  it("uses permit flow and bubbles errors", async () => {
    writeContractMock.mockRejectedValue({ statusCode: 402, message: "bad sig" });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/billing/purchase",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      payload: {
        permit: { deadline: 1, v: 27, r: "0x01", s: "0x02" }
      }
    });
    expect(res.statusCode).toBe(402);
  });

  it("returns 402 when auto-charge fails", async () => {
    makeWalletClientMock.mockReturnValue(null);
    attemptAutoChargeMock.mockRejectedValue({ statusCode: 402, message: "fail" });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/billing/purchase",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      payload: {}
    });
    expect(res.statusCode).toBe(402);
  });
});
