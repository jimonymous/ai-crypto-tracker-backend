import { redis } from "../redis";
import { encryptString, decryptString } from "../security/encryption";

const keyFor = (userId: string, exchange: string) => `exchange:cred:${userId}:${exchange.toLowerCase()}`;

export type ExchangeCredential = {
  apiKey: string;
  secret: string;
};

export const saveCredentials = async (userId: string, exchange: string, creds: ExchangeCredential) => {
  const payload = JSON.stringify({
    apiKey: encryptString(creds.apiKey),
    secret: encryptString(creds.secret)
  });
  await redis.set(keyFor(userId, exchange), payload);
};

export const loadCredentials = async (userId: string, exchange: string): Promise<ExchangeCredential | null> => {
  const raw = await redis.get(keyFor(userId, exchange));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { apiKey: string; secret: string };
    return {
      apiKey: decryptString(parsed.apiKey),
      secret: decryptString(parsed.secret)
    };
  } catch {
    return null;
  }
};

export const hasCredentials = async (userId: string, exchange: string): Promise<boolean> => {
  const raw = await redis.get(keyFor(userId, exchange));
  return !!raw;
};
