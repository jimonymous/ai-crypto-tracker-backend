import { CandleInput } from "./indicators";

export type IndicatorLatest = {
  ema20?: number | null;
  ema50?: number | null;
  ema200?: number | null;
  rsi14?: number | null;
  macd?: { macd: number; signal: number; histogram: number } | null;
  bollinger?: { upper: number; lower: number; basis: number; bandwidth: number } | null;
  atr14?: number | null;
  vwap?: number | null;
};

export type RatingOptions = {
  disabled?: string[];
  weights?: Partial<Record<"emaStack" | "rsi" | "macd" | "bollinger" | "vwap", number>>;
};

export type RatingResult = {
  score: number; // -1..1
  rating: number; // 0..100
  components: Record<string, number>;
  used: { disabled: string[]; weights: Required<RatingOptions["weights"]> };
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const computeRating = (
  close: number | null,
  latest: IndicatorLatest,
  opts: RatingOptions = {}
): RatingResult => {
  const disabled = new Set((opts.disabled ?? []).map((d) => d.toLowerCase()));
  const weights = {
    emaStack: opts.weights?.emaStack ?? 1,
    rsi: opts.weights?.rsi ?? 1,
    macd: opts.weights?.macd ?? 1,
    bollinger: opts.weights?.bollinger ?? 1,
    vwap: opts.weights?.vwap ?? 1
  };

  const components: Record<string, number> = {};
  const add = (name: keyof typeof weights, value: number | null) => {
    if (disabled.has(name.toLowerCase())) {
      components[name] = 0;
      return 0;
    }
    const v = value ?? 0;
    components[name] = v * weights[name];
    return components[name];
  };

  const emaScore = (() => {
    if (close == null || latest.ema20 == null || latest.ema50 == null || latest.ema200 == null) return 0;
    const bullish = close > latest.ema20 && latest.ema20 > latest.ema50 && latest.ema50 > latest.ema200;
    const bearish = close < latest.ema20 && latest.ema20 < latest.ema50 && latest.ema50 < latest.ema200;
    if (bullish) return 0.25;
    if (bearish) return -0.25;
    return 0;
  })();

  const rsiScore = (() => {
    const rsi = latest.rsi14;
    if (rsi == null) return 0;
    if (rsi >= 65) return 0.2;
    if (rsi <= 35) return -0.2;
    if (rsi >= 55) return 0.1;
    if (rsi <= 45) return -0.1;
    return 0;
  })();

  const macdScore = (() => {
    const hist = latest.macd?.histogram;
    if (hist == null) return 0;
    if (hist > 0) return 0.2;
    if (hist < 0) return -0.2;
    return 0;
  })();

  const bollScore = (() => {
    if (!latest.bollinger || close == null) return 0;
    const { upper, lower } = latest.bollinger;
    const width = upper - lower;
    if (width <= 0) return 0;
    const pos = (close - lower) / width; // 0 = lower, 1 = upper
    if (pos >= 0.8) return 0.15;
    if (pos <= 0.2) return -0.15;
    if (pos >= 0.6) return 0.05;
    if (pos <= 0.4) return -0.05;
    return 0;
  })();

  const vwapScore = (() => {
    if (latest.vwap == null || close == null) return 0;
    if (close > latest.vwap) return 0.1;
    if (close < latest.vwap) return -0.1;
    return 0;
  })();

  const sum =
    add("emaStack", emaScore) +
    add("rsi", rsiScore) +
    add("macd", macdScore) +
    add("bollinger", bollScore) +
    add("vwap", vwapScore);

  const score = clamp(sum, -1, 1);
  const rating = Math.round((score + 1) * 50); // map -1..1 to 0..100

  return {
    score,
    rating,
    components,
    used: { disabled: Array.from(disabled), weights }
  };
};
