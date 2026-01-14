export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type IndicatorPoint = {
  timestamp: number;
  value: number | Record<string, number | null> | null;
};

export type IndicatorSeries = {
  name: string;
  source?: string;
  params?: Record<string, string | number>;
  values: IndicatorPoint[];
};
