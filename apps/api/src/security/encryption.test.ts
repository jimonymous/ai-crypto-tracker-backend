import { describe, it, expect, beforeEach, vi } from "vitest";

const setKey = (value?: string) => {
  if (value === undefined) {
    delete process.env.PII_ENCRYPTION_KEY;
  } else {
    process.env.PII_ENCRYPTION_KEY = value;
  }
};

describe("encryption helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    setKey();
  });

  it("round-trips with a strong key", async () => {
    setKey("this-is-a-very-strong-key-value");
    const { encryptString, decryptString } = await import("./encryption");
    const plaintext = "sensitive-payload-123";
    const cipher = encryptString(plaintext);
    expect(cipher).not.toBe(plaintext);
    const decrypted = decryptString(cipher);
    expect(decrypted).toBe(plaintext);
  });

  it("throws when ciphertext is tampered", async () => {
    setKey("another-strong-secret-key-value");
    const { encryptString, decryptString } = await import("./encryption");
    const cipher = encryptString("hello-world");
    const buf = Buffer.from(cipher, "base64");
    buf[buf.length - 1] = buf[buf.length - 1] ^ 0b1111;
    const tampered = buf.toString("base64");
    expect(() => decryptString(tampered)).toThrow();
  });

  it("fails to decrypt with wrong key", async () => {
    setKey("primary-key-1234567890");
    const { encryptString, decryptString } = await import("./encryption");
    const cipher = encryptString("cannot-decrypt-with-other-key");
    setKey("different-key-0987654321");
    expect(() => decryptString(cipher)).toThrow();
  });

  it("rejects missing or weak keys", async () => {
    setKey("");
    const mod = await import("./encryption");
    expect(() => mod.encryptString("data")).toThrow(/PII_ENCRYPTION_KEY/);
    setKey("short");
    expect(() => mod.encryptString("data")).toThrow(/PII_ENCRYPTION_KEY/);
  });
});
