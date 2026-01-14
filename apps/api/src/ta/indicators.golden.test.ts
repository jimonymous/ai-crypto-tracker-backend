import { describe, it, expect } from "vitest";
import { computeIndicators, CandleInput } from "./indicators";

const buildFlatCandles = (count: number): CandleInput[] => {
  const candles: CandleInput[] = [];
  for (let i = 0; i < count; i++) {
    candles.push({
      timestamp: i * 60_000,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 100
    });
  }
  return candles;
};

describe("indicators golden values (flat series)", () => {
  it("matches expected outputs for a flat market", () => {
    const candles = buildFlatCandles(220); // covers longest warmups (200)
    const res = computeIndicators(candles);
    const idx = candles.length - 1;

    expect(res.ema20[idx].value).toBeCloseTo(100, 6);
    expect(res.ema50[idx].value).toBeCloseTo(100, 6);
    expect(res.ema200[idx].value).toBeCloseTo(100, 6);
    expect(res.sma50[idx].value).toBeCloseTo(100, 6);
    expect(res.sma200[idx].value).toBeCloseTo(100, 6);

    expect(res.rsi14[idx].value).toBeCloseTo(100, 6);

    const macd = res.macd[idx].value as any;
    expect(macd.macd).toBeCloseTo(0, 6);
    expect(macd.signal).toBeCloseTo(0, 6);
    expect(macd.histogram).toBeCloseTo(0, 6);

    const bb = res.bollinger[idx].value as any;
    expect(bb.middle).toBeCloseTo(100, 6);
    expect(bb.upper).toBeCloseTo(100, 6);
    expect(bb.lower).toBeCloseTo(100, 6);
    expect(bb.std).toBeCloseTo(0, 6);

    expect(res.atr14[idx].value).toBeCloseTo(2, 6); // (high-low)=2 on each bar
    expect(res.vwap[idx].value).toBeCloseTo(100, 6);

    const vwapBand = res.vwapBands[idx].value as any;
    expect(vwapBand.upper).toBeCloseTo(102, 6);
    expect(vwapBand.lower).toBeCloseTo(98, 6);

    const don20 = res.donchian20[idx].value as any;
    expect(don20.upper).toBeCloseTo(101, 6);
    expect(don20.lower).toBeCloseTo(99, 6);

    const don55 = res.donchian55[idx].value as any;
    expect(don55.upper).toBeCloseTo(101, 6);
    expect(don55.lower).toBeCloseTo(99, 6);

    expect(res.hv20[idx].value).toBeCloseTo(0, 6);
    expect(res.hv30[idx].value).toBeCloseTo(0, 6);
    expect(res.volumeZ20[idx].value).toBeCloseTo(0, 6);
  });
});
