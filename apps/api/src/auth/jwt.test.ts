import { describe, it, expect, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";

describe("jwt helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.JWT_EXPIRES_IN = "1h";
  });

  it("verifies a valid token", async () => {
    const mod = await import("./jwt");
    const token = mod.signJwt({ sub: "u1", email: "a@b.com" });
    const payload = mod.verifyJwt(token);
    expect(payload.sub).toBe("u1");
    expect(payload.email).toBe("a@b.com");
  });

  it("rejects expired tokens", async () => {
    const mod = await import("./jwt");
    const expired = jwt.sign({ sub: "u1" }, process.env.JWT_SECRET!, { expiresIn: "-1s" });
    expect(() => mod.verifyJwt(expired)).toThrow(/invalid token/i);
  });

  it("rejects tokens signed with wrong secret", async () => {
    const mod = await import("./jwt");
    const wrong = jwt.sign({ sub: "u1" }, "wrong-secret", { expiresIn: "1h" });
    expect(() => mod.verifyJwt(wrong)).toThrow(/invalid token/i);
  });

  it("rejects tampered signatures", async () => {
    const mod = await import("./jwt");
    const token = mod.signJwt({ sub: "u1" });
    const tampered = token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");
    expect(() => mod.verifyJwt(tampered)).toThrow(/invalid token/i);
  });
});
