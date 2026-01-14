import "dotenv/config";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Force on-chain path; avoid aggregator HTTP
vi.mock("./aggregators", () => ({
  getCachedQuote: vi.fn(async () => null)
}));

const hasRpc = !!process.env.ETH_MAINNET_RPC;

const suite = hasRpc ? describe : describe.skip;

suite("cycles live (mainnet RPC)", () => {
  beforeAll(() => {
    // keep RPC usage tiny; only 3 slot0/reserve reads
    vi.setConfig({ testTimeout: 30_000 });
  });

  it("builds a multicall using live pool prices", async () => {
    const { findCycles } = await import("./cycles");
    const opps = await findCycles({
      chainId: 1,
      tokens: [
        "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2", // WETH
        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48" // USDC
      ],
      bases: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48"],
      amount: "1000000", // 1 USDC in 6 decimals
      minProfitPct: -0.001, // allow small/negative to surface opps on volatile trio
      maxBankroll: 1000,
      minProfitAbs: 0,
      slippageBps: 50
    });

    expect(Array.isArray(opps)).toBe(true);
    if (!opps.length) {
      // Markets may be flat; we only assert the request succeeded.
      return;
    }
    const mc = opps[0].multicall;
    expect(mc?.data?.startsWith("0x")).toBe(true);
    expect(mc?.to).toBeTruthy();
  });
});
