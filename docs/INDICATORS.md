# Indicators – formulas and defaults

The API computes a server-side indicator set for AI/chat, alerts, and snapshots.

## Formulas (per candle)
- **SMA N**: simple moving average of close over N, null until N samples.
- **EMA N**: exponential moving average of close over N, null until N samples; seeded with SMA at N.
- **RSI14**: Wilder’s RSI with running avg gain/loss; null until 14 samples; 100 when losses are zero.
- **MACD (12,26,9)**: macdLine = EMA12 – EMA26; signal = EMA9(macdLine); histogram = macdLine – signal; null until both EMAs and signal exist.
- **Bollinger (20,2)**: mean/std of close over 20; upper = mean + 2σ; lower = mean – 2σ; null until 20 samples.
- **ATR14**: true range = max(high–low, |high–prevClose|, |low–prevClose|); ATR uses Wilder smoothing seeded at period; null until 14 samples.
- **VWAP**: cumulative (typicalPrice × volume) / cumulative volume; null only if cumulative volume is zero.
- **VWAP bands**: upper/lower = vwap ± ATR14; null if either side missing.
- **Donchian 20/55**: highest high / lowest low over window; null until window filled.
- **HV 20/30**: stddev of log returns over window; null until window filled.
- **Volume z-score 20**: z-score of volume over last 20; 0 when stddev is 0; null until 20 samples.

## Defaults
- Periods: EMA20/50/200, SMA50/200, RSI14, MACD(12/26/9), Bollinger(20,2), ATR14, Donchian20/55, HV20/30, VolumeZ20, VWAP + VWAP bands (ATR14).
- Warmup: indicators emit `null` until their window/smoothing is available (e.g., SMA50 is null for the first 49 points).

## Composite rating (buy/sell score)
- Endpoint: `GET /indicators/rating?symbol=BTC/USDT&timeframe=1h&enabled=rsi,macd,ema50&weights[rsi]=1.5`.
- The rating combines enabled indicators into a weighted score (0–100) plus a raw -1..1 bias and echoes the underlying indicator values.
- Clients can toggle indicators on/off or adjust weights per user/strategy; defaults use the standard set/weights.
- Intended for snapshot/AI/alerts surfaces; use alongside the per-indicator values returned in the response.

## Golden sanity (flat series)
For a flat series of 220 candles (open/close 100, high 101, low 99, volume 100):
- EMA/SMA 20/50/200 = 100
- RSI14 = 100
- MACD = { macd: 0, signal: 0, histogram: 0 }
- Bollinger: upper=middle=lower=100, std=0
- ATR14 = 2; VWAP = 100; VWAP bands: upper=102, lower=98
- Donchian20/55: upper=101, lower=99
- HV20/HV30 = 0; VolumeZ20 = 0

See `apps/api/src/ta/indicators.golden.test.ts` for the corresponding test case.
