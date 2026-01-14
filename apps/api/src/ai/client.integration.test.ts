import Fastify from "fastify";
import { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("ai client integration (live HTTP call)", () => {
  const token = "ai-secret-token";
  let server: Awaited<ReturnType<typeof Fastify>>;
  let url: string;
  const timeoutMs = 15000;

  beforeAll(async () => {
    const app = Fastify();
    app.post("/infer", async (request, reply) => {
      expect(request.headers.authorization).toBe(`Bearer ${token}`);
      const body = request.body as any;
      return reply.send({
        requestId: body?.requestId ?? "req-1",
        symbol: body?.symbol ?? "BTC/USDT",
        timeframe: body?.timeframe ?? "1h",
        horizonMinutes: body?.horizonMinutes ?? 60,
        asOf: Date.now(),
        probabilities: { pUp: 0.7 }
      });
    });
    server = app;
    const instance = await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    vi.resetModules();
  });

  const loadClient = async () => {
    vi.resetModules();
    vi.doMock("../config", () => ({
      config: {
        AI_SERVICE_URL: url,
        AI_AUTH_TOKEN: token
      }
    }));
    return import("./client");
  };

  it("calls a running AI service with auth header", async () => {
    const { callInference } = await loadClient();
    const res = await callInference({
      symbol: "BTC/USDT",
      timeframe: "1h",
      horizonMinutes: 30,
      candles: []
    });
    expect(res.probabilities.pUp).toBe(0.7);
    expect(res.symbol).toBe("BTC/USDT");
  }, timeoutMs);
});
