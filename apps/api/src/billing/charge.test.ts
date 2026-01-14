import { describe, expect, it, vi, beforeEach } from "vitest";
import { attemptAutoCharge } from "./charge";

const readContractMock = vi.fn();
const waitForReceiptMock = vi.fn();
const writeContractMock = vi.fn();

vi.mock("../chain/publicClient", () => ({
  makePublicClient: () => ({
    readContract: readContractMock,
    waitForTransactionReceipt: waitForReceiptMock
  }),
  makeWalletClient: () => ({
    account: { address: "0x0000000000000000000000000000000000000009" },
    writeContract: writeContractMock
  }),
  buildChain: (c: any) => ({ ...c, network: c.name || "test" })
}));

vi.mock("../chain/abis", () => ({ tokenAbi: [] }));

describe("attemptAutoCharge", () => {
  const chain = {
    id: 1,
    name: "test",
    rpcUrl: "http://rpc",
    token: { address: "0x0000000000000000000000000000000000000001", decimals: 18 },
    treasury: "0x0000000000000000000000000000000000000002"
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    readContractMock.mockResolvedValue(BigInt("1000000000000000000"));
    writeContractMock.mockResolvedValue("0xtxhash");
    waitForReceiptMock.mockResolvedValue({ status: "success" });
  });

  it("throws if allowance insufficient", async () => {
    readContractMock.mockResolvedValue(BigInt("1"));
    await expect(attemptAutoCharge("0xabc", BigInt("10"), chain)).rejects.toMatchObject({ statusCode: 402 });
  });

  it("writes transferFrom when allowance sufficient", async () => {
    await attemptAutoCharge("0xabc", BigInt("10"), chain);
    expect(writeContractMock).toHaveBeenCalled();
    expect(waitForReceiptMock).toHaveBeenCalled();
  });
});
