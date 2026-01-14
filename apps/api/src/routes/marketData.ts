import { FastifyInstance } from "fastify";
import { getDexChain, isAllowedChain, isAllowedToken } from "../dex/config";
import { fetchOnChainSpot } from "../dex/onchain";
import { createPublicClient, http, parseAbi } from "viem";

const erc20Abi = parseAbi(["function decimals() view returns (uint8)"]);
const v2Abi = parseAbi([
  "function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
]);

const makeClient = (chainId: number, rpcUrl: string) =>
  createPublicClient({
    chain: {
      id: chainId,
      name: `chain-${chainId}`,
      network: `chain-${chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } }
    },
    transport: http(rpcUrl)
  });

export default async function marketDataRoutes(app: FastifyInstance) {
  // On-chain DEX spot for a single pair (v2/v3 allowlisted pools)
  app.get("/dex/spot", async (request, reply) => {
    const { chainId = "1", sellToken, buyToken } = request.query as {
      chainId?: string;
      sellToken?: string;
      buyToken?: string;
    };
    const cid = Number(chainId);
    if (!isAllowedChain(cid)) return reply.status(400).send({ message: "unsupported chain" });
    if (!sellToken || !buyToken) return reply.status(400).send({ message: "sellToken and buyToken required" });
    if (!isAllowedToken(cid, sellToken) || !isAllowedToken(cid, buyToken)) {
      return reply.status(400).send({ message: "token not allowlisted" });
    }
    const spot = await fetchOnChainSpot(cid, sellToken, buyToken);
    if (!spot?.price) return reply.status(404).send({ message: "price unavailable" });
    return reply.send({
      source: spot.source,
      chainId: cid,
      sellToken,
      buyToken,
      price: spot.price,
      fetchedAt: spot.fetchedAt,
      ttlSeconds: spot.ttlSeconds
    });
  });

  // Live reserves/price for a specific v2 pool address on an allowlisted chain
  app.get("/dex/pool/reserves", async (request, reply) => {
    const { chainId = "1", poolAddress } = request.query as { chainId?: string; poolAddress?: string };
    const cid = Number(chainId);
    if (!isAllowedChain(cid)) return reply.status(400).send({ message: "unsupported chain" });
    if (!poolAddress) return reply.status(400).send({ message: "poolAddress required" });
    const chain = getDexChain(cid);
    if (!chain?.rpcUrl) return reply.status(400).send({ message: "rpcUrl not configured" });
    const client = makeClient(cid, chain.rpcUrl);
    try {
      const [reserve0, reserve1, ,] = (await client.readContract({
        address: poolAddress as `0x${string}`,
        abi: v2Abi,
        functionName: "getReserves"
      })) as any;
      const token0 = (await client.readContract({ address: poolAddress as `0x${string}`, abi: v2Abi, functionName: "token0" })) as `0x${string}`;
      const token1 = (await client.readContract({ address: poolAddress as `0x${string}`, abi: v2Abi, functionName: "token1" })) as `0x${string}`;
      const dec0 = (await client.readContract({ address: token0, abi: erc20Abi, functionName: "decimals" })) as number;
      const dec1 = (await client.readContract({ address: token1, abi: erc20Abi, functionName: "decimals" })) as number;
      const r0 = Number(reserve0) / 10 ** dec0;
      const r1 = Number(reserve1) / 10 ** dec1;
      const price0to1 = r1 && r0 ? r1 / r0 : null;
      return reply.send({
        chainId: cid,
        poolAddress,
        token0,
        token1,
        reserve0: r0,
        reserve1: r1,
        price0to1
      });
    } catch (err) {
      request.log.error({ err }, "failed to read pool reserves");
      return reply.status(400).send({ message: "failed to read pool" });
    }
  });
}
