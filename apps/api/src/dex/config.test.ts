import { describe, expect, it, vi } from "vitest";

describe("dex config generated pools sync", () => {
  it("loads pools.generated when present", async () => {
    vi.resetModules();

    // Load the freshly generated pools file (produced by scripts/discoverPools.ts)
    const generated = await import("./pools.generated");

    const generatedPoolsByChain = generated.generatedPoolsByChain;
    if (!generatedPoolsByChain || Object.keys(generatedPoolsByChain).length === 0) {
      throw new Error("generatedPoolsByChain is empty. Run discoverPools to populate it.");
    }

    const ethPools = generatedPoolsByChain.ethereum || generatedPoolsByChain[1] || [];
    if (!ethPools.length) {
      throw new Error("No ethereum pools found in generatedPoolsByChain; regenerate pools.");
    }

    const targetAddr = (ethPools[0].address as string).toLowerCase();

    const { getDexChain } = await import("./config");
    const chain = getDexChain(1);
    const found = chain?.pools.some((p: any) => p.address.toLowerCase() === targetAddr);
    expect(found).toBe(true);
  });
});
