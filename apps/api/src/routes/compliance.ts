import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { verifyJwt } from "../auth/jwt";
import { encryptString } from "../security/encryption";
import { provider } from "../compliance/provider";

export default async function complianceRoutes(app: FastifyInstance) {
  app.post("/compliance/kyc/start", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "missing token" });
    }
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return reply.status(401).send({ message: "user not found" });

    const startResult = await provider.start(user.id);

    const record = await prisma.kycVerification.upsert({
      where: { id: user.id },
      update: { status: startResult.status, reference: encryptString(startResult.reference ?? user.id) },
      create: {
        userId: user.id,
        provider: process.env.KYC_PROVIDER || "stub",
        status: startResult.status,
        reference: encryptString(startResult.reference ?? user.id)
      }
    });

    return reply.send({ status: record.status, provider: record.provider, reference: record.reference });
  });

  app.get("/compliance/kyc/status", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "missing token" });
    }
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyJwt(token);
    const record = await prisma.kycVerification.findFirst({ where: { userId: payload.sub } });
    return reply.send({ status: record?.status ?? "not_started", provider: record?.provider ?? process.env.KYC_PROVIDER, reference: record?.reference });
  });

  app.post("/compliance/kyc/verify", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "missing token" });
    }
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return reply.status(401).send({ message: "user not found" });

    const result = await provider.verify(user.id);
    await prisma.kycVerification.upsert({
      where: { id: user.id },
      update: { status: result.status, reference: encryptString(result.reference ?? user.id) },
      create: {
        userId: user.id,
        provider: process.env.KYC_PROVIDER || "stub",
        status: result.status,
        reference: encryptString(result.reference ?? user.id)
      }
    });

    return reply.send({ status: result.status });
  });
}
