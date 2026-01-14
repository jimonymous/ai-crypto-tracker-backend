export const ALLOWED_DEX_INTERVALS: Record<number, string> = {
  60: "1m",
  300: "5m",
  900: "15m",
  2700: "45m",
  5400: "90m",
  3600: "1h",
  10800: "3h"
};

export const allowedDexIntervalsSeconds = Object.keys(ALLOWED_DEX_INTERVALS).map((k) => Number(k));

export const intervalSecondsToTimeframe = (intervalSeconds: number): string => {
  const tf = ALLOWED_DEX_INTERVALS[intervalSeconds];
  if (!tf) {
    throw new Error(
      `intervalSeconds ${intervalSeconds} not allowed; use one of ${allowedDexIntervalsSeconds.join(", ")}`
    );
  }
  return tf;
};

export const isAllowedDexInterval = (intervalSeconds: number) =>
  Boolean(ALLOWED_DEX_INTERVALS[intervalSeconds]);
