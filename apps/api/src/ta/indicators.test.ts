import { describe, it, expect } from "vitest";
import { computeIndicators, CandleInput } from "./indicators";

const buildCandles = (): CandleInput[] => {
  const base = 100;
  const candles: CandleInput[] = [];
  for (let i = 0; i < 250; i++) {
    candles.push({
      timestamp: i * 60_000,
      open: base + i * 0.1,
      high: base + i * 0.1 + 1,
      low: base + i * 0.1 - 1,
      close: base + i * 0.1,
      volume: 100 + i
    });
  }
  return candles;
};

describe("indicators", () => {
  it("computes EMAs with warmup nulls", () => {
    const candles = buildCandles();
    const res = computeIndicators(candles);
    expect(res.ema20[0].value).toBeNull();
    expect(res.ema20[19].value).not.toBeNull();
    expect(res.ema200[199].value).not.toBeNull();
    expect(res.sma50[49].value).not.toBeNull();
    expect(res.sma200[199].value).not.toBeNull();
  });

  it("computes RSI and MACD histogram", () => {
    const candles = buildCandles();
    const res = computeIndicators(candles);
    const lastRsi = res.rsi14[res.rsi14.length - 1].value;
    expect(lastRsi).toBeGreaterThan(0);
    expect(lastRsi).toBeLessThanOrEqual(100);
    const lastMacd = res.macd[res.macd.length - 1].value;
    expect(lastMacd).not.toBeNull();
    if (lastMacd) {
      expect(typeof (lastMacd as any).macd).toBe("number");
      expect(typeof (lastMacd as any).signal).toBe("number");
    }
  });

  it("computes Bollinger Bands and ATR", () => {
    const candles = buildCandles();
    const res = computeIndicators(candles);
    const lastBb = res.bollinger[res.bollinger.length - 1].value;
    expect(lastBb).not.toBeNull();
    const lastAtr = res.atr14[res.atr14.length - 1].value;
    expect(lastAtr).toBeGreaterThan(0);
    const vwapBand = res.vwapBands[res.vwapBands.length - 1].value;
    expect(vwapBand).not.toBeNull();
  });

  it("computes Donchian, HV, and volume z-score", () => {
    const candles = buildCandles();
    const res = computeIndicators(candles);
    expect(res.donchian20[19].value).not.toBeNull();
    expect(res.donchian55[54].value).not.toBeNull();
    expect(res.hv20[19].value).not.toBeNull();
    expect(res.volumeZ20[19].value).not.toBeNull();
  });
});
