export type DexRouterEntry = {
  chainId: number;
  network: string;
  dex: string;
  version: string;
  kind: "v2" | "v3" | "cl";
  router: `0x${string}`;
  quoter?: `0x${string}`;
  notes?: string;
};

// Curated allowlist of v2/v3-compatible routers/quoters by chain.
export const dexRouters: DexRouterEntry[] = [
  // Uniswap v2
  {
    chainId: 1,
    network: "ethereum",
    dex: "uniswap",
    version: "v2",
    kind: "v2",
    router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
  },
  // SushiSwap common deployments (same router on many chains)
  {
    chainId: 1,
    network: "ethereum",
    dex: "sushiswap",
    version: "v2",
    kind: "v2",
    router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"
  },
  {
    chainId: 42161,
    network: "arbitrum",
    dex: "sushiswap",
    version: "v2",
    kind: "v2",
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"
  },
  {
    chainId: 137,
    network: "polygon",
    dex: "sushiswap",
    version: "v2",
    kind: "v2",
    router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"
  },
  // PancakeSwap v2 (BSC)
  {
    chainId: 56,
    network: "bsc",
    dex: "pancakeswap",
    version: "v2",
    kind: "v2",
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E"
  },
  // QuickSwap v2 (Polygon)
  {
    chainId: 137,
    network: "polygon",
    dex: "quickswap",
    version: "v2",
    kind: "v2",
    router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff"
  },
  // Trader Joe v1 (Avalanche)
  {
    chainId: 43114,
    network: "avalanche",
    dex: "traderjoe",
    version: "v1",
    kind: "v2",
    router: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4"
  },
  // SpookySwap / SpiritSwap (Fantom)
  {
    chainId: 250,
    network: "fantom",
    dex: "spookyswap",
    version: "v2",
    kind: "v2",
    router: "0xF491e7B69E4244ad4002BC14e878a34207E38c29"
  },
  {
    chainId: 250,
    network: "fantom",
    dex: "spiritswap",
    version: "v2",
    kind: "v2",
    router: "0x16327E3FbDaCA3bcF7E38F5Af2599D2DDc33aE52"
  },
  // ApeSwap v2
  {
    chainId: 56,
    network: "bsc",
    dex: "apeswap",
    version: "v2",
    kind: "v2",
    router: "0xcf0feBd3f17CEf5b47b0cD257aCf6025c5bff3b7"
  },
  {
    chainId: 137,
    network: "polygon",
    dex: "apeswap",
    version: "v2",
    kind: "v2",
    router: "0xC0788A3aD43d79aa53B09c2EaCc313A787d1d607"
  },

  // Uniswap v3 family (same router/quoter on many chains)
  {
    chainId: 1,
    network: "ethereum",
    dex: "uniswap",
    version: "v3",
    kind: "v3",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"
  },
  {
    chainId: 137,
    network: "polygon",
    dex: "uniswap",
    version: "v3",
    kind: "v3",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"
  },
  {
    chainId: 10,
    network: "optimism",
    dex: "uniswap",
    version: "v3",
    kind: "v3",
    router: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"
  },
  // Uniswap v3 Base (different addresses)
  {
    chainId: 8453,
    network: "base",
    dex: "uniswap",
    version: "v3",
    kind: "v3",
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"
  },
  // Uniswap v3 BNB
  {
    chainId: 56,
    network: "bsc",
    dex: "uniswap",
    version: "v3",
    kind: "v3",
    router: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",
    quoter: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077"
  },
  // PancakeSwap v3
  {
    chainId: 56,
    network: "bsc",
    dex: "pancakeswap",
    version: "v3",
    kind: "v3",
    router: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
    quoter: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997"
  },
  {
    chainId: 1,
    network: "ethereum",
    dex: "pancakeswap",
    version: "v3",
    kind: "v3",
    router: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
    quoter: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997"
  },
  // QuickSwap v3 (Polygon, Algebra)
  {
    chainId: 137,
    network: "polygon",
    dex: "quickswap",
    version: "v3",
    kind: "v3",
    router: "0xf5b509bB0909a69B1c207E495f687a596C168E12",
    quoter: "0xa15F0D7377B2A0C0c10db057f641beD21028FC89"
  },
  // Camelot v3 (Arbitrum)
  {
    chainId: 42161,
    network: "arbitrum",
    dex: "camelot",
    version: "v3",
    kind: "v3",
    router: "0x1F721E2E82F6676FCE4eA07A5958cF098D339e18",
    quoter: "0x0Fc73040b26E9bC8514fA028D998E73A254Fa76E"
  },
  // Aerodrome (Base) - CL router
  {
    chainId: 8453,
    network: "base",
    dex: "aerodrome",
    version: "cl",
    kind: "cl",
    router: "0xbE6d8f0d05cC4Be24d5167A3eF062215bE6d18A5"
  },
  // Velodrome (Optimism) - CL/universal
  {
    chainId: 10,
    network: "optimism",
    dex: "velodrome",
    version: "cl",
    kind: "cl",
    router: "0x01D40099fCD87C018969B0e8D4aB1633Fb34763C"
  }
];
