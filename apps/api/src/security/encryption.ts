import crypto from "crypto";

const getKey = () => {
  const raw = process.env.PII_ENCRYPTION_KEY || "";
  if (raw.trim().length < 16) {
    throw new Error("PII_ENCRYPTION_KEY must be at least 16 characters");
  }
  return raw.padEnd(32, "0").slice(0, 32);
};

export const encryptString = (plaintext: string): string => {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key), iv);
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

export const decryptString = (ciphertext: string): string => {
  const key = getKey();
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const encrypted = data.slice(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key), iv);
  decipher.setAuthTag(tag);
  const decrypted = decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
  return decrypted;
};
