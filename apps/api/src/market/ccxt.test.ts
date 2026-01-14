import { beforeEach, describe, expect, it, vi } from "vitest";
import * as ccxt from "ccxt";

const fetchMock = vi.fn();
const loadMarketsMock = vi.fn();

vi.mock("ccxt", async () => {
  class DummyEx {
    id = "binance";
    rateLimit = 100;
    async loadMarkets() {
      return loadMarketsMock();
    }
    async fetchOHLCV(symbol: string, timeframe: string) {
      return fetchMock(symbol, timeframe);
    }
  }
  class RateErr extends Error {}
  class NetErr extends Error {}
  return {
    __esModule: true,
    default: { binance: DummyEx, RateLimitExceeded: RateErr, NetworkError: NetErr },
    Exchange: DummyEx,
    RateLimitExceeded: RateErr,
    NetworkError: NetErr
  };
});

describe("fetchOHLCVWithRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    loadMarketsMock.mockReset();
  });

  it("retries on rate limit and succeeds", async () => {
    const { fetchOHLCVWithRateLimit } = await import("./ccxt");
    const rateErr = new (ccxt as any).RateLimitExceeded("rate");
    fetchMock.mockRejectedValueOnce(rateErr).mockResolvedValueOnce([[1, 2, 3, 4, 5, 6]]);
    const res = await fetchOHLCVWithRateLimit({ exchangeId: "binance", symbol: "BTC/USDT", timeframe: "1h" });
    expect(res.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails after max attempts", async () => {
    const { fetchOHLCVWithRateLimit } = await import("./ccxt");
    fetchMock.mockRejectedValue(new Error("boom"));
    await expect(
      fetchOHLCVWithRateLimit({ exchangeId: "binance", symbol: "BTC/USDT", timeframe: "1h" })
    ).rejects.toThrow();
  });
});
