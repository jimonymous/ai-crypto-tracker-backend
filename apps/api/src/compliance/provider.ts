import { prisma } from "../db";

type VerificationResult = {
  status: "pending" | "verified" | "failed";
  reference?: string;
};

export interface KycProvider {
  start(userId: string): Promise<VerificationResult>;
  status(userId: string): Promise<VerificationResult>;
  verify(userId: string): Promise<VerificationResult>;
}

class StubProvider implements KycProvider {
  async start(userId: string): Promise<VerificationResult> {
    return { status: "pending", reference: userId };
  }
  async status(userId: string): Promise<VerificationResult> {
    const record = await prisma.kycVerification.findFirst({ where: { userId } });
    return { status: (record?.status as any) ?? "not_started", reference: record?.reference ?? undefined };
  }
  async verify(userId: string): Promise<VerificationResult> {
    return { status: "verified", reference: userId };
  }
}

class ManualProvider implements KycProvider {
  async start(userId: string): Promise<VerificationResult> {
    await prisma.kycVerification.upsert({
      where: { id: userId },
      update: { status: "pending" },
      create: { userId, provider: "manual", status: "pending", reference: userId }
    });
    return { status: "pending", reference: userId };
  }
  async status(userId: string): Promise<VerificationResult> {
    const record = await prisma.kycVerification.findFirst({ where: { userId } });
    return { status: (record?.status as any) ?? "not_started", reference: record?.reference ?? undefined };
  }
  async verify(userId: string): Promise<VerificationResult> {
    await prisma.kycVerification.updateMany({ where: { userId }, data: { status: "verified" } });
    return { status: "verified", reference: userId };
  }
}

const providerName = process.env.KYC_PROVIDER || "stub";
export const provider: KycProvider = providerName === "manual" ? new ManualProvider() : new StubProvider();
