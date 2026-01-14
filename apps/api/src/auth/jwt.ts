import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../config";

type JwtPayload = {
  sub: string;
  email?: string | null;
  walletAddress?: string | null;
};

const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"];
const REFRESH_EXPIRES_IN = "30d" as SignOptions["expiresIn"];

export const signJwt = (payload: JwtPayload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const signRefreshToken = (payload: JwtPayload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
};

export const verifyJwt = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (err: any) {
    const e: any = new Error("invalid token");
    e.statusCode = 401;
    e.cause = err;
    throw e;
  }
};

export const buildAuthResponse = (user: { id: string; email: string | null; walletAddress: string | null }) => {
  const token = signJwt({
    sub: user.id,
    email: user.email,
    walletAddress: user.walletAddress
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      walletAddress: user.walletAddress
    }
  };
};
