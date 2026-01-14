import { FastifyInstance } from "fastify";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "../auth/password";
import { buildAuthResponse, signRefreshToken, verifyJwt } from "../auth/jwt";
import { verifyGoogleIdToken } from "../auth/oauth";
import speakeasy from "speakeasy";

export default async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const body = request.body as { email?: string; password?: string; walletAddress?: string };
    if (!body?.email || !body?.password) {
      return reply.status(400).send({ message: "email and password are required" });
    }

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(409).send({ message: "email already registered" });
    }

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        walletAddress: body.walletAddress ?? null
      }
    });

    const refresh = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: signRefreshToken({ sub: user.id, email: user.email, walletAddress: user.walletAddress }),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    return reply.send({ ...buildAuthResponse(user), refreshToken: refresh.token });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string; totp?: string };
    if (!body?.email || !body?.password) {
      return reply.status(400).send({ message: "email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.passwordHash) {
      return reply.status(401).send({ message: "invalid credentials" });
    }

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      return reply.status(401).send({ message: "invalid credentials" });
    }

    if (user.isTotpEnabled) {
      if (!body?.totp) {
        return reply.status(401).send({ message: "totp required" });
      }
      const verified = speakeasy.totp.verify({
        secret: user.totpSecret ?? "",
        encoding: "base32",
        token: body.totp,
        window: 1
      });
      if (!verified) {
        return reply.status(401).send({ message: "invalid totp" });
      }
    }

    const refresh = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: signRefreshToken({ sub: user.id, email: user.email, walletAddress: user.walletAddress }),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    return reply.send({ ...buildAuthResponse(user), refreshToken: refresh.token });
  });

  app.post("/auth/oauth/google", async (request, reply) => {
    const body = request.body as { idToken?: string };
    if (!body?.idToken) {
      return reply.status(400).send({ message: "idToken required" });
    }
    try {
      const payload = await verifyGoogleIdToken(body.idToken);
      let user = await prisma.user.findUnique({ where: { email: payload.email ?? undefined } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: payload.email,
            passwordHash: null,
            walletAddress: null
          }
        });
      }
      const refresh = await prisma.refreshToken.create({
        data: {
          userId: user.id,
          token: signRefreshToken({ sub: user.id, email: user.email, walletAddress: user.walletAddress }),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });
      return reply.send({ ...buildAuthResponse(user), refreshToken: refresh.token });
    } catch (err) {
      request.log.error(err);
      return reply.status(401).send({ message: "invalid Google token" });
    }
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = request.body as { refreshToken?: string };
    if (!body?.refreshToken) {
      return reply.status(400).send({ message: "refreshToken required" });
    }
    const tokenRecord = await prisma.refreshToken.findUnique({ where: { token: body.refreshToken } });
    if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt < new Date()) {
      return reply.status(401).send({ message: "invalid refresh token" });
    }
    const user = await prisma.user.findUnique({ where: { id: tokenRecord.userId } });
    if (!user) return reply.status(401).send({ message: "user not found" });
    const newRefresh = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: signRefreshToken({ sub: user.id, email: user.email, walletAddress: user.walletAddress }),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    await prisma.refreshToken.update({
      where: { token: body.refreshToken },
      data: { revokedAt: new Date() }
    });
    return reply.send({ ...buildAuthResponse(user), refreshToken: newRefresh.token });
  });

  app.post("/auth/totp/setup", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "missing token" });
    }
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return reply.status(401).send({ message: "user not found" });

    const secret = speakeasy.generateSecret({ name: "AI Crypto Tracker" });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: secret.base32
      }
    });

    return reply.send({ otpauthUrl: secret.otpauth_url });
  });

  app.post("/auth/totp/enable", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "missing token" });
    }
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.totpSecret) {
      return reply.status(400).send({ message: "totp not initialized" });
    }

    const body = request.body as { code?: string };
    if (!body?.code) return reply.status(400).send({ message: "code required" });

    const verified = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: "base32",
      token: body.code,
      window: 1
    });

    if (!verified) {
      return reply.status(400).send({ message: "invalid code" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isTotpEnabled: true
      }
    });

    return reply.send({ status: "enabled" });
  });

  app.get("/auth/me", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ message: "missing token" });
    }
    const token = authHeader.slice("Bearer ".length);
    try {
      const payload = verifyJwt(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        return reply.status(401).send({ message: "user not found" });
      }
      return reply.send({
        id: user.id,
        email: user.email,
        walletAddress: user.walletAddress
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(401).send({ message: "invalid token" });
    }
  });
}
