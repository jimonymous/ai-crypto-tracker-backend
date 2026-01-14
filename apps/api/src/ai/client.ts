import { config } from "../config";
import { IndicatorSeries, Candle as SharedCandle } from "../types/shared";
import { fetch } from "undici";
import fs from "node:fs";
import path from "node:path";

export type InferencePayload = {
  symbol: string;
  timeframe: string;
  horizonMinutes: number;
  asOf?: number;
  modelVersion?: string;
  candles: SharedCandle[];
  indicators?: IndicatorSeries[];
  requestId?: string;
};

export type InferenceResponse = {
  requestId?: string;
  symbol: string;
  timeframe: string;
  horizonMinutes: number;
  asOf: number;
  probabilities: Record<string, number>;
  regime?: { label: string; confidence: number; rationale?: string[] };
  featureImportances?: { feature: string; importance: number }[];
  rationale?: string[];
};

export type TrainPayload = {
  symbol: string;
  timeframe: string;
  horizonMinutes: number;
  candles: SharedCandle[];
  indicators?: IndicatorSeries[];
  test_size?: number;
  requestId?: string;
};

export type TrainResponse = {
  symbol: string;
  timeframe: string;
  horizonMinutes: number;
  requestId?: string;
  metrics: Record<string, number>;
  featureImportances: { feature: string; importance: number }[];
  modelArtifacts: Record<string, string>;
};

export type BacktestResponse = {
  symbol: string;
  timeframe: string;
  metrics: Record<string, number>;
};

export type ChatContext = Record<string, any>;
export type ChatPayload = {
  message: string;
  system?: string;
  model?: string;
  contexts?: ChatContext[];
};

export type ChatResponse = {
  output: string;
  model: string;
  requestId?: string;
};

const artifactsRoot = path.resolve(process.cwd(), "../ai/artifacts");
const safeSymbol = (symbol: string) => symbol.replace(/\//g, "-");
export const hasLocalArtifacts = (symbol: string, timeframe: string) => {
  const up = path.join(artifactsRoot, `v1_${safeSymbol(symbol)}_${timeframe}_p_up.pkl`);
  const vol = path.join(artifactsRoot, `v1_${safeSymbol(symbol)}_${timeframe}_p_high_vol.pkl`);
  return fs.existsSync(up) && fs.existsSync(vol);
};

const postAi = async <T>(path: string, payload: unknown): Promise<T> => {
  if (!config.AI_SERVICE_URL) {
    throw new Error("AI_SERVICE_URL is not configured");
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.AI_AUTH_TOKEN) {
    headers.authorization = `Bearer ${config.AI_AUTH_TOKEN}`;
  }
  const res = await fetch(`${config.AI_SERVICE_URL.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI service error (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 2, backoffMs = 200): Promise<T> => {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries) break;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * (i + 1)));
    }
  }
  throw lastErr;
};

export const callInference = async (payload: InferencePayload): Promise<InferenceResponse> =>
  withRetry(() => postAi<InferenceResponse>("/infer", payload));

export const callTrain = async (payload: TrainPayload): Promise<TrainResponse> =>
  postAi<TrainResponse>("/train", payload);

export const callTrainDeep = async (payload: TrainPayload): Promise<TrainResponse> =>
  postAi<TrainResponse>("/train/deep", payload);

export const callBacktest = async (payload: TrainPayload): Promise<BacktestResponse> =>
  postAi<BacktestResponse>("/backtest", payload);

export const callChat = async (payload: ChatPayload): Promise<ChatResponse> =>
  postAi<ChatResponse>("/chat", payload);
