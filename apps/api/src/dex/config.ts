import { config } from "../config";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const generatedPoolsByChain: Record<string, { address: string; token0: string; token1: string; kind: string; feeTierBps?: number }[]> =
  (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("./pools.generated");
      return (mod && (mod.generatedPoolsByChain || mod.default?.generatedPoolsByChain)) || {};
    } catch {
      return {};
    }
  })();

export type DexToken = { symbol: string; address: `0x${string}`; decimals: number };
export type DexPool = {
  address: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
  feeTierBps?: number; // for Uniswap v3
  kind: "uniswap-v3" | "uniswap-v2" | "algebra";
};

export type DexChainConfig = {
  chainId: number;
  name: string;
  rpcUrl: string;
  routers?: {
    swapRouter?: `0x${string}`;
    universalRouter?: `0x${string}`;
    quoter?: `0x${string}`;
    v2Router?: `0x${string}`;
    oneInch?: `0x${string}`;
  };
  tokens: DexToken[];
  pools: DexPool[];
  aggregators: {
    zerox?: string;
  };
};

const mainnet: DexChainConfig = {
  chainId: 1,
  name: "ethereum",
  rpcUrl: config.ETH_MAINNET_RPC || config.CHAIN_RPC_URL,
  routers: {
    swapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    universalRouter: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    v2Router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    oneInch: "0x1111111254eeb25477b68fb85ed929f73a960582"
  },
  tokens: [
    { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", decimals: 6 },
    { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
    { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
    { symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
    { symbol: "LDO", address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", decimals: 18 },
    { symbol: "MKR", address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", decimals: 18 },
    { symbol: "AAVE", address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DdAE9", decimals: 18 },
    { symbol: "SUSHI", address: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2", decimals: 18 },
    { symbol: "FRAX", address: "0x853d955aCEf822Db058eb8505911ED77F175b99e", decimals: 18 },
    { symbol: "COMP", address: "0xc00e94Cb662C3520282E6f5717214004A7f26888", decimals: 18 },
    { symbol: "SNX", address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F", decimals: 18 },
    { symbol: "YFI", address: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e", decimals: 18 }
  ],
  pools: [
    // Uniswap v3 staples
    { address: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640", token0: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", feeTierBps: 500, kind: "uniswap-v3" }, // USDC/WETH 0.05
    { address: "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8", token0: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", feeTierBps: 3000, kind: "uniswap-v3" }, // USDC/WETH 0.3
    { address: "0x11b815efB8f581194ae79006d24E0d814B7697F6", token0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", token1: "0xdAC17F958D2ee523a2206206994597C13D831ec7", feeTierBps: 500, kind: "uniswap-v3" }, // WETH/USDT 0.05
    { address: "0x4585FE77225b41b697C938B018E2Ac67Ac5a20c0", token0: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", feeTierBps: 500, kind: "uniswap-v3" }, // WBTC/WETH 0.05
    { address: "0x3416cF6C708Da44DB2624D63ea0AAef7113527C6", token0: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48", token1: "0xdAC17F958D2ee523a2206206994597C13D831ec7", feeTierBps: 100, kind: "uniswap-v3" }, // USDC/USDT 0.01
    { address: "0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168", token0: "0x6B175474E89094C44Da98b954EedeAC495271d0F", token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48", feeTierBps: 500, kind: "uniswap-v3" }, // DAI/USDC 0.05
    { address: "0x5d4F3C6fA16908609BAC31Ff148Bd002AA6b8c83", token0: "0x514910771AF9Ca656af840dff83E8264EcF986CA", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", feeTierBps: 500, kind: "uniswap-v3" }, // LINK/WETH 0.05
    { address: "0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801", token0: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", feeTierBps: 3000, kind: "uniswap-v3" }, // UNI/WETH 0.3
    { address: "0xa3f558aebAecAf0e11cA4b2199cC5Ed341edfd74", token0: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", feeTierBps: 3000, kind: "uniswap-v3" }, // LDO/WETH 0.3
    { address: "0xe8c6c9227491C0a8156A0106A0204d881BB7E531", token0: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", feeTierBps: 3000, kind: "uniswap-v3" }, // MKR/WETH 0.3
    { address: "0x4674abc5796e1334B5075326b39B748bee9EaA34", token0: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DdAE9", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", feeTierBps: 500, kind: "uniswap-v3" }, // AAVE/WETH 0.05
    { address: "0x73A6a761FE483bA19DeBb8f56aC5bbF14c0cdad1", token0: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", feeTierBps: 3000, kind: "uniswap-v3" }, // SUSHI/WETH 0.3
    { address: "0xc63B0708E2F7e69CB8A1df0e1389A98C35A76D52", token0: "0x853d955aCEf822Db058eb8505911ED77F175b99e", token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48", feeTierBps: 500, kind: "uniswap-v3" }, // FRAX/USDC 0.05

    // Uniswap v2 mains
    { address: "0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852", token0: "0xdAC17F958D2ee523a2206206994597C13D831ec7", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" }, // WETH/USDT
    { address: "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc", token0: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" }, // USDC/WETH
    { address: "0xd3d2E2692501A5c9Ca623199D38826e513033a17", token0: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" }, // UNI/WETH
    { address: "0xAE461cA67B15dc8dc81CE7615e0320dA1A9aB8D5", token0: "0x6B175474E89094C44Da98b954EedeAC495271d0F", token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48", kind: "uniswap-v2" }, // DAI/USDC
    { address: "0x3041CbD36888bECc7bbCBc0045E3B1f144466f5f", token0: "0xdAC17F958D2ee523a2206206994597C13D831ec7", token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48", kind: "uniswap-v2" }, // USDT/USDC
    { address: "0x004375Dff511095CC5A197A54140a24EFef3A416", token0: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48", kind: "uniswap-v2" }, // WBTC/USDC
    { address: "0xCFfDdeD873554F362Ac02f8Fb1f02E5ada10516f", token0: "0xc00e94Cb662C3520282E6f5717214004A7f26888", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" }, // COMP/WETH
    { address: "0xDFC14d2Af169B0D36C4EFF567Ada9b2E0CAE044f", token0: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DdAE9", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" }, // AAVE/WETH
    { address: "0xa2107FA5B38d9bbd2C461D6EDf11B11A50F6b974", token0: "0x514910771AF9Ca656af840dff83E8264EcF986CA", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" }, // LINK/WETH
    { address: "0xC2aDdA861F89bBB333c90c492cB837741916A225", token0: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" }, // MKR/WETH
    { address: "0x43AE24960e5534731Fc831386c07755A2dc33D47", token0: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" }, // SNX/WETH
    { address: "0x2fDbAdf3C4D5A8666Bc06645B8358ab803996E28", token0: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" }, // YFI/WETH
    { address: "0xBb2b8038a1640196FbE3e38816F3e67Cba72D940", token0: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" }, // WBTC/WETH
    // Sushi v2 staples
    { address: "0x06da0fd433C1A5d7a4faa01111c044910A184553", token0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", token1: "0xdAC17F958D2ee523a2206206994597C13D831ec7", kind: "uniswap-v2" }, // WETH/USDT
    { address: "0xD86A120a06255Df8D4e2248aB04d4267E23aDfaA", token0: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48", token1: "0xdAC17F958D2ee523a2206206994597C13D831ec7", kind: "uniswap-v2" }, // USDC/USDT
    { address: "0xC40D16476380e4037e6b1A2594cAF6a6cc8Da967", token0: "0x514910771AF9Ca656af840dff83E8264EcF986CA", token1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", kind: "uniswap-v2" } // LINK/WETH sushi
  ],
  aggregators: {
    zerox: "https://api.0x.org"
  }
};

const sepolia: DexChainConfig = {
  chainId: 11155111,
  name: "sepolia",
  rpcUrl: config.ETH_SEPOLIA_RPC || config.CHAIN_RPC_URL,
  tokens: [
    // Common test tokens; adjust as needed
    { symbol: "WETH", address: "0x97fA43695a1658b0b09fCB9aD65183b74C39E7a5", decimals: 18 },
    { symbol: "USDC", address: "0x6b56bfBcaa2B8f08B89e2e446d3aC9f0C1c439A3", decimals: 6 }
  ],
  pools: [],
  aggregators: {
    zerox: "https://sepolia.api.0x.org"
  }
};

const polygon: DexChainConfig = {
  chainId: 137,
  name: "polygon",
  rpcUrl: config.POLYGON_MAINNET_RPC || config.CHAIN_RPC_URL,
  routers: {
    swapRouter: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    universalRouter: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
    quoter: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    v2Router: "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", // QuickSwap / Sushi style
    oneInch: "0xb74ea157ac524db9a7aa1d2de675cfbb212419f5"
  },
  tokens: [
    { symbol: "WETH", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
    { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    { symbol: "WBTC", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8 },
    { symbol: "WMATIC", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
    { symbol: "LINK", address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", decimals: 18 },
    { symbol: "AAVE", address: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", decimals: 18 },
    { symbol: "DAI", address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
    { symbol: "UNI", address: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f", decimals: 18 },
    { symbol: "FRAX", address: "0x45c32fA6DF82ead1e2EF74d17b76547EDdFaFF89", decimals: 18 },
    { symbol: "SUSHI", address: "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a", decimals: 18 },
    { symbol: "BAL", address: "0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3", decimals: 18 }
  ],
  pools: [
    { address: "0x7bAF833f82BB1971f99A5a5d84bED1d5D0dEDD70", token0: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", token1: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", kind: "uniswap-v2" }, // WETH/USDC
    { address: "0xF6422B997c7F54D1c6a6e103bcb1499EeA0a7046", token0: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", token1: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", kind: "uniswap-v2" }, // WETH/USDT
    { address: "0xE43AB6540C0929EF29D216A34ab1F0eaCc5C3825", token0: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", token1: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", kind: "uniswap-v2" }, // USDC/USDT
    { address: "0xdC9232E2Df177d7a12FdFf6EcBAb114E2231198D", token0: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", token1: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", kind: "uniswap-v2" }, // WBTC/WETH
    { address: "0x6D9e8dbB2779853db00418D4DcF96F3987CFC9D2", token0: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", token1: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", kind: "uniswap-v2" }, // WMATIC/USDC
    { address: "0x5cA6CA6c3709E1E6CFe74a50Cf6B2B6BA2Dadd67", token0: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", token1: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", kind: "uniswap-v2" }, // LINK/WETH
    { address: "0x90bc3E68Ba8393a3Bf2D79309365089975341a43", token0: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B", token1: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", kind: "uniswap-v2" }, // AAVE/WETH
    { address: "0xD29a84Ba6DEb95063bd3a0a32212dCb272156Bea", token0: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", token1: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", kind: "uniswap-v2" }, // DAI/USDC
    { address: "0xF7135272a5584Eb116f5a77425118a8B4A2ddfDb", token0: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f", token1: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", kind: "uniswap-v2" }, // UNI/WETH
    { address: "0x49E7D82DAfCC415a6eDD6e20F1710f3F024e964e", token0: "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a", token1: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", kind: "uniswap-v2" }, // SUSHI/WETH
    { address: "0xF6F3Bd0ADBF1bB9E3E031159F631Dd88d4a108c5", token0: "0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3", token1: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", kind: "uniswap-v2" } // BAL/WETH
  ],
  aggregators: {
    zerox: "https://polygon.api.0x.org"
  }
};

const polygonAmoy: DexChainConfig = {
  chainId: 80002,
  name: "polygon-amoy",
  rpcUrl: config.POLYGON_AMOY_RPC || config.CHAIN_RPC_URL,
  routers: {},
  tokens: [],
  pools: [],
  aggregators: {
    zerox: undefined
  }
};

const bsc: DexChainConfig = {
  chainId: 56,
  name: "bsc",
  rpcUrl: config.BSC_MAINNET_RPC || config.CHAIN_RPC_URL,
  routers: {
    v2Router: "0x10ED43C718714eb63d5aA57B78B54704E256024E"
  },
  tokens: [
    { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
    { symbol: "BUSD", address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", decimals: 18 },
    { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    { symbol: "CAKE", address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 },
    { symbol: "ETH", address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8", decimals: 18 },
    { symbol: "BTCB", address: "0x7130d2a12b9bcfaae4f2634d864a1ee1ce3ead9c", decimals: 18 },
    { symbol: "DAI", address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18 },
    { symbol: "ADA", address: "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47", decimals: 18 },
    { symbol: "XRP", address: "0x1D2F0da169ceB9Fc7A15C44dE1fE87d5F0eD5E9E", decimals: 18 },
    { symbol: "DOGE", address: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", decimals: 8 },
    { symbol: "UNI", address: "0xBf5140A22578168FD562DCcF235E5D43A02ce9B1", decimals: 18 },
    { symbol: "LINK", address: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD", decimals: 18 },
    { symbol: "SXP", address: "0x47BEAd2563dCBf3b0B42e8cB6e1eE98Fbb9b30F5", decimals: 18 }
  ],
  pools: [
    { address: "0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16", token0: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", token1: "0xe9e7cea3dedca5984780bafc599bd69add087d56", kind: "uniswap-v2" }, // WBNB/BUSD
    { address: "0x7EFaEf62fDdCCa950418312c6C91Aef321375A00", token0: "0xe9e7cea3dedca5984780bafc599bd69add087d56", token1: "0x55d398326f99059fF775485246999027B3197955", kind: "uniswap-v2" }, // BUSD/USDT
    { address: "0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE", token0: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", token1: "0x55d398326f99059fF775485246999027B3197955", kind: "uniswap-v2" }, // WBNB/USDT
    { address: "0x0eD7e52944161450477ee417DE9Cd3a859b14fD0", token0: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", token1: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", kind: "uniswap-v2" }, // CAKE/WBNB
    { address: "0x7213a321F1855CF1779f42c0CD85d3D95291D34C", token0: "0x2170ed0880ac9a755fd29b2688956bd959f933f8", token1: "0xe9e7cea3dedca5984780bafc599bd69add087d56", kind: "uniswap-v2" }, // ETH/BUSD
    { address: "0x66FDB2eCCfB58cF098eaa419e5EfDe841368e489", token0: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", token1: "0xe9e7cea3dedca5984780bafc599bd69add087d56", kind: "uniswap-v2" }, // DAI/BUSD
    { address: "0x1E249DF2F58cBef7EAc2b0EE35964ED8311D5623", token0: "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47", token1: "0xe9e7cea3dedca5984780bafc599bd69add087d56", kind: "uniswap-v2" }, // ADA/BUSD
    { address: "0xE27859308ae2424506D1ac7BF5bcb92D6a73e211", token0: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", token1: "0xe9e7cea3dedca5984780bafc599bd69add087d56", kind: "uniswap-v2" } // DOGE/BUSD
  ],
  aggregators: {}
};

const arbitrum: DexChainConfig = {
  chainId: 42161,
  name: "arbitrum",
  rpcUrl: config.ARBITRUM_MAINNET_RPC || config.CHAIN_RPC_URL,
  routers: {
    v2Router: "0xc873fEcbd354f5A56E00E710B90EF4201db2448d"
  },
  tokens: [
    { symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
    { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    { symbol: "WBTC", address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8 },
    { symbol: "LINK", address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", decimals: 18 },
    { symbol: "UNI", address: "0xfa7F8980b0f1E64A2062791cc3b0871572f1F7f0", decimals: 18 },
    { symbol: "AAVE", address: "0xba5DdD1f9d7F570dc94a51479a000E3BCE967196", decimals: 18 },
    { symbol: "DAI", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
    { symbol: "FRAX", address: "0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F", decimals: 18 },
    { symbol: "SUSHI", address: "0xd4d42F0b6DEF4CE0383636770eF773390d85c61A", decimals: 18 },
    { symbol: "GMX", address: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a", decimals: 18 },
    { symbol: "SYN", address: "0x080F6AEd32Fc474DD5717105Dba5ea57268F46eb", decimals: 18 }
  ],
  pools: [
    { address: "0x54B26fAf3671677C19F70c4B879A6f7B898F732c", token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", kind: "uniswap-v2" }, // WETH/USDC
    { address: "0x97b192198d164C2a1834295e302B713bc32C8F1d", token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", token1: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", kind: "uniswap-v2" }, // WETH/USDT
    { address: "0x96059759C6492fb4e8a9777b65f307F2C811a34F", token0: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", token1: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", kind: "uniswap-v2" }, // WBTC/WETH
    { address: "0x935763d7c14925690B89B14d738EcD8Bf37db39a", token0: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", token1: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", kind: "uniswap-v2" }, // USDC/USDT
    { address: "0x65Cfd8fB82213971076457756dFEdB6143391983", token0: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", token1: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", kind: "uniswap-v2" }, // LINK/WETH
    { address: "0xa635415F18CDA471F5384465a9Bc2097755E137f", token0: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", kind: "uniswap-v2" }, // DAI/USDC
    { address: "0xdc2167F4A5DeC5401EcEFF1CB55C3573A13F24bD", token0: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", token1: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", kind: "uniswap-v2" } // GMX/WETH
  ],
  aggregators: {}
};

const optimism: DexChainConfig = {
  chainId: 10,
  name: "optimism",
  rpcUrl: config.OPTIMISM_MAINNET_RPC || config.CHAIN_RPC_URL,
  routers: {
    v2Router: "0x9c12939390052919aF3155f41Bf4160Fd3666A6f"
  },
  tokens: [
    { symbol: "OP", address: "0x4200000000000000000000000000000000000042", decimals: 18 },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
    { symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499Ad98a8ce58e58", decimals: 6 },
    { symbol: "WBTC", address: "0x68f180fcce6836688e9084f035309e29bf0a2095", decimals: 8 },
    { symbol: "DAI", address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", decimals: 18 },
    { symbol: "LINK", address: "0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6", decimals: 18 },
    { symbol: "UNI", address: "0x6fd9d7AD17242c41f7131d257212c54A0e816691", decimals: 18 },
    { symbol: "AAVE", address: "0x76fb31fb4af56892a25e32cfc43de717950c9278", decimals: 18 },
    { symbol: "FRAX", address: "0x2e3d870790dc77a83dd1d18184acc7439a53f475", decimals: 18 },
    { symbol: "GMX", address: "0x3390108E913824B8eaD638444cc52B9aBdF63798", decimals: 18 },
    { symbol: "SYN", address: "0x5A5fF6E2f0A6A58d05b56bD68a8a68b5cE5bB6eD", decimals: 18 }
  ],
  pools: [
    { address: "0x055f06391C4bb260e43Fb5D5315Ab67271E6A790", token0: "0x4200000000000000000000000000000000000006", token1: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", kind: "uniswap-v2" }, // WETH/USDC volatile
    { address: "0xC875B07B96b53B80557354a170eDD483D24C3BA0", token0: "0x4200000000000000000000000000000000000006", token1: "0x94b008aA00579c1307B0EF2c499Ad98a8ce58e58", kind: "uniswap-v2" }, // WETH/USDT
    { address: "0x4867FF5867599a437ffd303A8e544B373CCf5A30", token0: "0x68f180fcce6836688e9084f035309e29bf0a2095", token1: "0x4200000000000000000000000000000000000006", kind: "uniswap-v2" }, // WBTC/WETH
    { address: "0x0a67810AE38a61d6C68c46f8Dfe60C8F4819ABc4", token0: "0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6", token1: "0x4200000000000000000000000000000000000006", kind: "uniswap-v2" }, // LINK/WETH
    { address: "0x1E29eCEAfa5abd6F45C8Bf72f1fFDfC2342d2591", token0: "0x76fb31fb4af56892a25e32cfc43de717950c9278", token1: "0x4200000000000000000000000000000000000006", kind: "uniswap-v2" } // AAVE/WETH
  ],
  aggregators: {}
};

const base: DexChainConfig = {
  chainId: 8453,
  name: "base",
  rpcUrl: config.BASE_MAINNET_RPC || config.CHAIN_RPC_URL,
  routers: {
    v2Router: "0xcf77a3BA9A5CA399B7c97c74d54e5b1BeB874E43"
  },
  tokens: [
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
    { symbol: "WBTC", address: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", decimals: 8 },
    { symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
    { symbol: "LINK", address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196", decimals: 18 },
    { symbol: "UNI", address: "0x453Edb6f3B48cF6A2e4b7f21eC0A667f2bECd42D", decimals: 18 },
    { symbol: "AAVE", address: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB", decimals: 18 },
    { symbol: "FRAX", address: "0x9D0464996170c6B9e75eED71c68B99dDEDf279e8", decimals: 18 },
    { symbol: "BAL", address: "0x4158734D47Fc9692176B5085E0F52ee0Da5d47F1", decimals: 18 },
    { symbol: "SUSHI", address: "0x7D49a065D17d6d4a55dc13649901fdBB98B2AFBA", decimals: 18 },
    { symbol: "CBETH", address: "0x2ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18 }
  ],
  pools: [
    { address: "0xcDAC0d6c6C59727a65F871236188350531885C43", token0: "0x4200000000000000000000000000000000000006", token1: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", kind: "uniswap-v2" }, // WETH/USDC
    { address: "0xFFD4Ec4BD2211cBFD58C209FdEcC65F63f2b9e4c", token0: "0x4200000000000000000000000000000000000006", token1: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", kind: "uniswap-v2" }, // WETH/USDT
    { address: "0x96508AE8037c6bD16162620187691F1c1e3e07C1", token0: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", token1: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", kind: "uniswap-v2", feeTierBps: undefined }, // USDC/USDT (stable)
    { address: "0x44Ecc644449fC3a9858d2007CaA8CFAa4C561f91", token0: "0x2ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", token1: "0x4200000000000000000000000000000000000006", kind: "uniswap-v2" } // cbETH/WETH volatile
  ],
  aggregators: {}
};

const avalanche: DexChainConfig = {
  chainId: 43114,
  name: "avalanche",
  rpcUrl: config.AVALANCHE_MAINNET_RPC || config.CHAIN_RPC_URL,
  routers: {
    v2Router: "0x60aE616a2155Ee3d9a68541Ba4544862310933d4"
  },
  tokens: [
    { symbol: "WAVAX", address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", decimals: 18 },
    { symbol: "USDC", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 },
    { symbol: "USDT", address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6 },
    { symbol: "WBTC", address: "0x50b7545627a5162F82A992c33b87aDc75187B218", decimals: 8 },
    { symbol: "WETH", address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", decimals: 18 },
    { symbol: "DAI", address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", decimals: 18 },
    { symbol: "MIM", address: "0x130966628846BFd36ff31a822705796e8cb8C18D", decimals: 18 },
    { symbol: "PNG", address: "0x60781C2586D68229fde47564546784ab3fACA982", decimals: 18 },
    { symbol: "LINK", address: "0x5947BB275c521040051D82396192181b413227A3", decimals: 18 },
    { symbol: "SUSHI", address: "0x39cf1BD5f15fb22eC3D9Ff86b0727aFc203427cc", decimals: 18 },
    { symbol: "UNI", address: "0x8EBaf22B6F053dFFeaf46f4Dd9eFA95D89ba8580", decimals: 18 },
    { symbol: "AAVE", address: "0x63a72806098Bd3D9520cC43356dD78afe5D386D9", decimals: 18 }
  ],
  pools: [
    { address: "0xf4003F4efBE8691B60249E6afbD307aBE7758adb", token0: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", token1: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", kind: "uniswap-v2" }, // WAVAX/USDC
    { address: "0xFE15c2695F1F920da45C30AAE47d11dE51007AF9", token0: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", token1: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", kind: "uniswap-v2" }, // WAVAX/WETH
    { address: "0xd5a37dC5C9A396A03dd1136Fc76A1a02B1c88Ffa", token0: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", token1: "0x50b7545627a5162F82A992c33b87aDc75187B218", kind: "uniswap-v2" }, // WAVAX/WBTC
    { address: "0xbb4646a764358ee93c2a9c4a147d5aDEd527ab73", token0: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", token1: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", kind: "uniswap-v2" }, // WAVAX/USDT
    { address: "0x5e7e2077a83d203910DA89E46D06D71190E7E4b0", token0: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", token1: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", kind: "uniswap-v2" }, // DAI/USDC
    { address: "0x8D5dB5D48F5C46A4263DC46112B5d2e3c5626423", token0: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", token1: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", kind: "uniswap-v2" }, // USDT/USDC
    { address: "0xa503a768AafF4237a5EBB1B7d3177703B56901eB", token0: "0x130966628846BFd36ff31a822705796e8cb8C18D", token1: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", kind: "uniswap-v2" }, // MIM/USDC
    { address: "0x3dAF1C6268362214eBB064647555438c6f365F96", token0: "0x60781C2586D68229fde47564546784ab3fACA982", token1: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", kind: "uniswap-v2" }, // PNG/WAVAX
    { address: "0x6F3a0C89f611Ef5dC9d96650324ac633D02265D3", token0: "0x5947BB275c521040051D82396192181b413227A3", token1: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", kind: "uniswap-v2" } // LINK/WAVAX
  ],
  aggregators: {}
};

const applyGeneratedPools = (cfg: DexChainConfig, key: string) => {
  const generated = generatedPoolsByChain[key];
  if (generated?.length) {
    cfg.pools = generated.map((p) => ({
      address: p.address as `0x${string}`,
      token0: p.token0 as `0x${string}`,
      token1: p.token1 as `0x${string}`,
      feeTierBps: p.feeTierBps,
      kind: p.kind === "uniswap-v3" ? "uniswap-v3" : p.kind === "algebra" ? "algebra" : "uniswap-v2"
    }));
  }
};

applyGeneratedPools(mainnet, "ethereum");
applyGeneratedPools(bsc, "bsc");
applyGeneratedPools(polygon, "polygon");
applyGeneratedPools(arbitrum, "arbitrum");
applyGeneratedPools(optimism, "optimism");
applyGeneratedPools(base, "base");
applyGeneratedPools(avalanche, "avalanche");

const dexChains: DexChainConfig[] = [mainnet, sepolia, polygon, polygonAmoy, bsc, arbitrum, optimism, base, avalanche];

export const getDexChains = () => dexChains;

export const getDexChain = (chainId?: number): DexChainConfig | undefined =>
  dexChains.find((c) => c.chainId === (chainId || c.chainId));

export const findToken = (chain: DexChainConfig, addrOrSymbol: string): DexToken | undefined => {
  const lc = addrOrSymbol.toLowerCase();
  return chain.tokens.find(
    (t) => t.symbol.toLowerCase() === lc || t.address.toLowerCase() === lc
  );
};

export const isAllowedToken = (chainId: number, token: string) => {
  const cfg = getDexChain(chainId);
  if (!cfg) return false;
  return !!findToken(cfg, token);
};

export const isAllowedChain = (chainId: number) => !!getDexChain(chainId);
