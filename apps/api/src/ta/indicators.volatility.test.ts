import { describe, it, expect } from "vitest";
import { computeIndicators, CandleInput } from "./indicators";

const buildVolatileCandles = (): CandleInput[] => {
  const candles: CandleInput[] = [];

  // Base uptrend
  for (let i = 0; i < 80; i++) {
    const close = 100 + i * 0.1;
    candles.push({
      timestamp: i * 60_000,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100
    });
  }

  // Spike up with big volume
  for (let i = 0; i < 10; i++) {
    const close = 150 + i * 0.2;
    const idx = candles.length;
    candles.push({
      timestamp: idx * 60_000,
      open: close,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1000
    });
  }

  // Sharp dip with elevated volume
  for (let i = 0; i < 10; i++) {
    const close = 80 - i * 0.3;
    const idx = candles.length;
    candles.push({
      timestamp: idx * 60_000,
      open: close,
      high: close + 2,
      low: close - 2,
      close,
      volume: 800
    });
  }

  // Recovery
  for (let i = 0; i < 20; i++) {
    const close = 90 + i * 0.4;
    const idx = candles.length;
    candles.push({
      timestamp: idx * 60_000,
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 120
    });
  }

  return candles;
};

describe("indicators volatility/trend scenarios", () => {
  const spikeIdx = 85; // during spike
  const dipIdx = 95; // during dip
  const earlyIdx = 40; // calm period

  it("reacts to volatility spikes, dips, and recovery", () => {
    const candles = buildVolatileCandles();
    const res = computeIndicators(candles);
    const end = candles.length - 1;

    // Bollinger bands widen under volatility
    const widthEarly = (res.bollinger[earlyIdx].value as any).upper - (res.bollinger[earlyIdx].value as any).lower;
    const widthSpike = (res.bollinger[spikeIdx].value as any).upper - (res.bollinger[spikeIdx].value as any).lower;
    expect(widthSpike).toBeGreaterThan(widthEarly);

    // ATR climbs during spike/dip vs calm
    expect((res.atr14[spikeIdx].value as number)).toBeGreaterThan(res.atr14[earlyIdx].value as number);
    expect((res.atr14[dipIdx].value as number)).toBeGreaterThan(res.atr14[earlyIdx].value as number);

    // HV increases after turbulence
    expect((res.hv20[dipIdx].value as number)).toBeGreaterThan((res.hv20[earlyIdx].value as number));

    // Volume z-score flags the spike (elevated vs calm)
    expect(res.volumeZ20[spikeIdx].value as number).toBeGreaterThan(1);

    // MACD and RSI respond to recovery (not collapsing; still within a reasonable band)
    const macdEnd = res.macd[end].value as any;
    expect(macdEnd.macd).toBeGreaterThan(-5);
    expect(macdEnd.signal).toBeGreaterThan(-5);
    expect(res.rsi14[end].value as number).toBeGreaterThan(35);

    // Donchian captures extremes within the window
    const donEnd = res.donchian55[end].value as any;
    expect(donEnd.upper).toBeCloseTo(154, 0); // spike highs ~153.8
    expect(donEnd.lower).toBeCloseTo(75, 0); // dip lows ~75.3
  });
});
