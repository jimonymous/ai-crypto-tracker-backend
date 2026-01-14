import { FastifyInstance } from "fastify";
import { isAddress } from "viem";
import { makePublicClient } from "../chain/publicClient";
import { chains, selectChainWithRpc, ChainConfig } from "../chain/config";
import { tokenAbi } from "../chain/abis";

type TokenDescriptor = {
  address: string;
  symbol: string;
  decimals?: number;
};

const parseTokens = (chain: ChainConfig): TokenDescriptor[] => {
  const list = process.env.WALLET_TOKEN_LIST;
  if (!list) {
    return [
      {
        address: chain.token.address,
        symbol: process.env.REWARD_TOKEN_SYMBOL || "CTT",
        decimals: chain.token.decimals
      }
    ];
  }

  // Format: address:symbol:decimals,address2:symbol2:decimals
  return list.split(",").map((item) => {
    const [address, symbol, decimals] = item.split(":");
    return { address, symbol, decimals: decimals ? Number(decimals) : undefined };
  });
};

export default async function walletRoutes(app: FastifyInstance) {
  app.get("/wallet/balances", async (request, reply) => {
    const { address, chainId, rpcUrl } = request.query as { address?: string; chainId?: string; rpcUrl?: string };
    if (!address || !isAddress(address)) {
      return reply.status(400).send({ message: "valid address is required" });
    }

    const chain = selectChainWithRpc(chainId ? Number(chainId) : undefined, rpcUrl);
    const publicClient = makePublicClient(chain);

    const tokens = parseTokens(chain).filter((t) => t.address && isAddress(t.address as `0x${string}`));

    const balances = await Promise.all(
      tokens.map(async (token) => {
        try {
          const decimals =
            token.decimals ??
            (await publicClient.readContract({
              address: token.address as `0x${string}`,
              abi: tokenAbi,
              functionName: "decimals"
            }));
          const balance = await publicClient.readContract({
            address: token.address as `0x${string}`,
            abi: tokenAbi,
            functionName: "balanceOf",
            args: [address as `0x${string}`]
          });
          return {
            token: token.symbol,
            address: token.address,
            balance: balance.toString(),
            decimals: Number(decimals)
          };
        } catch (err) {
          request.log.error({ err, token: token.address }, "failed to read balance");
          return {
            token: token.symbol,
            address: token.address,
            balance: "0",
            decimals: token.decimals ?? chain.token.decimals,
            error: "failed"
          };
        }
      })
    );

    return reply.send({ address, balances });
  });
}
