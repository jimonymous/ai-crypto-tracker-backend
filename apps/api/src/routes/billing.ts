import { FastifyInstance } from "fastify";
import { getPriceInfo, ensureActiveAccess } from "../billing/accessPass";
import { verifyJwt } from "../auth/jwt";
import { prisma } from "../db";
import { verifyErc20Transfer } from "../chain/verifyTransfer";
import { selectChainWithRpc } from "../chain/config";
import { attemptAutoCharge } from "../billing/charge";
import { feeTreasuryAbi } from "../chain/abis";
import { makePublicClient, makeWalletClient } from "../chain/publicClient";

export default async function billingRoutes(app: FastifyInstance) {
  app.get("/billing/price", async (request, reply) => {
    const { chainId, rpcUrl } = request.query as { chainId?: string; rpcUrl?: string };
    const chain = selectChainWithRpc(chainId ? Number(chainId) : undefined, rpcUrl);
    const info = getPriceInfo(chain);
    return reply.send(info);
  });

  app.post("/billing/purchase", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "missing token" });
    }
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyJwt(token);

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.walletAddress) {
      return reply.status(400).send({ message: "user or wallet not found" });
    }

    const body = request.body as { txHash?: string };
    const { chainId: queryChainId, rpcUrl: queryRpcUrl } = request.query as {
      chainId?: string;
      rpcUrl?: string;
    };
    const bodyChainId = (body as any)?.chainId;
    const bodyRpcUrl = (body as any)?.rpcUrl as string | undefined;
    const chain = selectChainWithRpc(
      queryChainId ? Number(queryChainId) : bodyChainId != null ? Number(bodyChainId) : undefined,
      queryRpcUrl || bodyRpcUrl
    );
    const walletClient = makeWalletClient(chain);
    try {
      if (body?.txHash) {
        const info = getPriceInfo(chain);
        const ok = await verifyErc20Transfer(
          {
            txHash: body.txHash as `0x${string}`,
            tokenAddress: chain.token.address as `0x${string}`,
            from: user.walletAddress as `0x${string}`,
            to: chain.treasury as `0x${string}`,
            minAmount: BigInt(info.amountWei)
          },
          chain
        );
        if (!ok) {
          return reply.status(402).send({ message: "payment tx not verified" });
        }
      } else if ((body as any)?.permit && walletClient) {
        const info = getPriceInfo(chain);
        const permit = (body as any).permit as {
          deadline: number;
          v: number;
          r: `0x${string}`;
          s: `0x${string}`;
        };
        const hash = await walletClient.writeContract({
          address: chain.treasury as `0x${string}`,
          abi: feeTreasuryAbi as any,
          functionName: "collectWithPermit",
          args: [
            user.walletAddress as `0x${string}`,
            BigInt(info.amountWei),
            BigInt(permit.deadline),
            permit.v,
            permit.r,
            permit.s
          ]
        });
        const pub = makePublicClient(chain);
        await pub.waitForTransactionReceipt({ hash });
        request.log.info({ hash }, "Collected with permit");
      } else {
        try {
          const info = getPriceInfo(chain);
          const hash = await attemptAutoCharge(user.walletAddress as `0x${string}`, BigInt(info.amountWei), chain);
          request.log.info({ hash }, "Auto-charged ACT for access pass");
        } catch (err: any) {
          return reply.status(err?.statusCode ?? 402).send({
            message: "auto-charge failed; submit txHash to confirm payment",
            error: err?.message
          });
        }
      }

      const pass = await ensureActiveAccess(user.id, user.walletAddress, chain);
      return reply.send({
        status: "active",
        expiresAt: pass.expiresAt,
        periodMinutes: pass.periodMinutes,
        walletAddress: pass.walletAddress
      });
    } catch (err: any) {
      const status = err?.statusCode ?? 402;
      return reply.status(status).send({
        message: "insufficient ACT balance for access period",
        requiredWei: err?.requiredWei,
        balanceWei: err?.balanceWei,
        tokenAddress: err?.tokenAddress,
        tokenSymbol: err?.tokenSymbol,
        periodMinutes: err?.periodMinutes
      });
    }
  });
}
