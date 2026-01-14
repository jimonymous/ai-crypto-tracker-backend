export type CandleInput = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type IndicatorPoint<T = number | Record<string, number | null> | null> = {
  timestamp: number;
  value: T | null;
};

const computeEMAFromSeries = (values: Array<number | null>, period: number): Array<number | null> => {
  const alpha = 2 / (period + 1);
  const result: Array<number | null> = [];
  const buffer: number[] = [];
  let ema: number | null = null;

  for (const value of values) {
    if (value == null) {
      result.push(null);
      continue;
    }

    buffer.push(value);
    if (buffer.length < period && ema === null) {
      result.push(null);
      continue;
    }

    if (buffer.length === period && ema === null) {
      const sma = buffer.reduce((sum, v) => sum + v, 0) / period;
      ema = sma;
      result.push(ema);
      continue;
    }

    ema = alpha * value + (1 - alpha) * (ema as number);
    result.push(ema);
  }

  return result;
};

const computeEMA = (values: number[], period: number): Array<number | null> =>
  computeEMAFromSeries(values.map((v) => v ?? null), period);

const computeSMA = (values: number[], period: number): Array<number | null> => {
  const res: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i + 1 < period) {
      res.push(null);
    } else {
      res.push(sum / period);
    }
  }
  return res;
};

const rollingStats = (arr: number[], period: number, index: number) => {
  if (index + 1 < period) {
    return null;
  }
  const window = arr.slice(index + 1 - period, index + 1);
  const mean = window.reduce((s, v) => s + v, 0) / period;
  const variance =
    window.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { mean, std };
};

const computeRSI = (closes: number[], period: number): Array<number | null> => {
  const result: Array<number | null> = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      result.push(null);
      continue;
    }

    const change = closes[i] - closes[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    if (i < period) {
      avgGain += gain;
      avgLoss += loss;
      result.push(null);
      continue;
    }

    if (i === period) {
      avgGain = (avgGain + gain) / period;
      avgLoss = (avgLoss + loss) / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) {
      result.push(100);
      continue;
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    result.push(rsi);
  }

  return result;
};

const computeATR = (candles: CandleInput[], period: number): Array<number | null> => {
  const trs: Array<number | null> = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1]?.close;

    if (i === 0 || prevClose == null) {
      trs.push(null);
      continue;
    }

    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    trs.push(tr);
  }

  const result: Array<number | null> = [];
  let atr: number | null = null;

  for (let i = 0; i < trs.length; i++) {
    const tr = trs[i];
    if (tr == null) {
      result.push(null);
      continue;
    }

    if (i < period) {
      result.push(null);
      continue;
    }

    if (i === period) {
      const window = trs.slice(1, period + 1).filter((v): v is number => v != null);
      atr = window.reduce((s, v) => s + v, 0) / period;
      result.push(atr);
      continue;
    }

    atr = ((atr as number) * (period - 1) + tr) / period;
    result.push(atr);
  }

  return result;
};

const computeVWAP = (candles: CandleInput[]): Array<number | null> => {
  const result: Array<number | null> = [];
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;

    if (cumulativeVolume === 0) {
      result.push(null);
      continue;
    }

    result.push(cumulativePV / cumulativeVolume);
  }

  return result;
};

const computeDonchian = (candles: CandleInput[], period: number): Array<{ upper: number; lower: number } | null> => {
  const res: Array<{ upper: number; lower: number } | null> = [];
  for (let i = 0; i < candles.length; i++) {
    if (i + 1 < period) {
      res.push(null);
      continue;
    }
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = i + 1 - period; j <= i; j++) {
      highestHigh = Math.max(highestHigh, candles[j].high);
      lowestLow = Math.min(lowestLow, candles[j].low);
    }
    res.push({ upper: highestHigh, lower: lowestLow });
  }
  return res;
};

const computeHV = (closes: number[], period: number): Array<number | null> => {
  const res: Array<number | null> = [];
  const logs = closes.map((c) => Math.log(c));
  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < period) {
      res.push(null);
      continue;
    }
    const window = logs.slice(i + 1 - period, i + 1);
    const mean = window.reduce((s, v) => s + v, 0) / period;
    const variance = window.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period;
    const hv = Math.sqrt(variance);
    res.push(hv);
  }
  return res;
};

const computeVolumeZScore = (volumes: number[], period: number): Array<number | null> => {
  const res: Array<number | null> = [];
  let window: number[] = [];
  for (let i = 0; i < volumes.length; i++) {
    window.push(volumes[i]);
    if (window.length > period) window.shift();
    if (window.length < period) {
      res.push(null);
      continue;
    }
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const variance = window.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / window.length;
    const std = Math.sqrt(variance);
    res.push(std === 0 ? 0 : (volumes[i] - mean) / std);
  }
  return res;
};

export const computeIndicators = (candles: CandleInput[]) => {
  const timestamps = candles.map((c) => c.timestamp);
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const ema20 = computeEMA(closes, 20);
  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const sma50 = computeSMA(closes, 50);
  const sma200 = computeSMA(closes, 200);

  const rsi14 = computeRSI(closes, 14);

  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine: Array<number | null> = ema12.map((val, idx) =>
    val != null && ema26[idx] != null ? val - (ema26[idx] as number) : null
  );
  const signalLine = computeEMAFromSeries(macdLine, 9);
  const histogram: Array<number | null> = macdLine.map((val, idx) =>
    val != null && signalLine[idx] != null ? val - (signalLine[idx] as number) : null
  );

  const bollinger = closes.map((_, idx) => {
    const stats = rollingStats(closes, 20, idx);
    if (!stats) return null;
    const { mean, std } = stats;
    return {
      upper: mean + 2 * std,
      middle: mean,
      lower: mean - 2 * std,
      std
    };
  });

  const atr14 = computeATR(candles, 14);
  const vwap = computeVWAP(candles);
  const donchian20 = computeDonchian(candles, 20);
  const donchian55 = computeDonchian(candles, 55);
  const hv20 = computeHV(closes, 20);
  const hv30 = computeHV(closes, 30);
  const volumeZ20 = computeVolumeZScore(candles.map((c) => c.volume), 20);

  const vwapBands = vwap.map((val, idx) => {
    const atr = atr14[idx];
    if (val == null || atr == null) return null;
    return { upper: val + atr, lower: val - atr };
  });

  const mapSeries = <T>(values: Array<T | null>): IndicatorPoint<T>[] =>
    values.map((value, idx) => ({
      timestamp: timestamps[idx],
      value
    }));

  return {
    ema20: mapSeries(ema20),
    ema50: mapSeries(ema50),
    ema200: mapSeries(ema200),
    sma50: mapSeries(sma50),
    sma200: mapSeries(sma200),
    rsi14: mapSeries(rsi14),
    macd: mapSeries(
      macdLine.map((val, idx) =>
        val == null || signalLine[idx] == null || histogram[idx] == null
          ? null
          : {
              macd: val,
              signal: signalLine[idx] as number,
              histogram: histogram[idx] as number
            }
      )
    ),
    bollinger: mapSeries(bollinger),
    atr14: mapSeries(atr14),
    vwap: mapSeries(vwap),
    vwapBands: mapSeries(vwapBands),
    donchian20: mapSeries(donchian20),
    donchian55: mapSeries(donchian55),
    hv20: mapSeries(hv20),
    hv30: mapSeries(hv30),
    volumeZ20: mapSeries(volumeZ20)
  };
};
