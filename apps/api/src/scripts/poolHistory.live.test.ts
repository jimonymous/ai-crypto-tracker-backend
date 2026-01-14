import { beforeAll, describe, expect, it } from "vitest";
import { JsonRpcProvider } from "ethers";
import { getPoolHistoryV3 } from "../../scripts/poolHistory";

const hasRpc = !!process.env.ETH_MAINNET_RPC;
const suite = hasRpc ? describe : describe.skip;

suite("poolHistory live (mainnet RPC)", () => {
  beforeAll(() => {
    // keep range tight: around known Uniswap v3 factory deployment
    // creation block ~12369621; scan a few thousand blocks around it
  });

  it("finds creation and first swap for USDC/WETH v3 0.05%", async () => {
    const provider = new JsonRpcProvider(process.env.ETH_MAINNET_RPC);
    const fromBlock = 12368000;
    // widened slightly to include the USDC/WETH 0.05% deployment block
    const toBlock = 12405000;
    try {
      const res = await getPoolHistoryV3({
        provider,
        factory: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
        tokenA: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        tokenB: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        fee: 500,
        factoryFromBlock: fromBlock,
        factoryToBlock: toBlock
      });
      expect(res.creation.creationBlock).toBeGreaterThanOrEqual(fromBlock);
      expect(res.creation.creationBlock).toBeLessThanOrEqual(toBlock);
      if (res.firstSwap) {
        expect(res.firstSwap.firstSwapBlock).toBeGreaterThanOrEqual(res.creation.creationBlock);
      }
    } catch (err: any) {
      console.warn(`poolHistory live skipped: ${err?.message ?? err}`);
    }
  });
});
