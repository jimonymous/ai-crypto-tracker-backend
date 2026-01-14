export const computeVolatility = (prices: number[]): number => {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / returns.length;
  return Math.sqrt(variance);
};

export const computeVaR = (returns: number[], percentile = 0.95): number => {
  if (!returns.length) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor((1 - percentile) * sorted.length);
  return sorted[Math.max(0, idx)];
};

export const computePnLTimeline = (pnlPoints: { timestamp: number; pnl: number }[]) => {
  let cumulative = 0;
  return pnlPoints
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((p) => {
      cumulative += p.pnl;
      return { ...p, cumulative };
    });
};

export const checkLiquidationRisk = (prices: number[], thresholdPct: number) => {
  if (prices.length < 2) return false;
  const peak = Math.max(...prices);
  const current = prices[prices.length - 1];
  const drawdown = (peak - current) / peak;
  return drawdown >= thresholdPct;
};
