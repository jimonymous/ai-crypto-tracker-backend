import type { z } from "zod";
import {
  aiInferenceRequestSchema,
  aiInferenceResponseSchema,
  authSessionSchema,
  authUserSchema,
  candleSchema,
  featureImportanceSchema,
  indicatorPointSchema,
  indicatorSeriesSchema,
  regimeClassificationSchema,
  rewardEntrySchema,
  rewardStatusSchema,
  rewardsSnapshotSchema,
  snapshotResponseSchema,
  tokenGateRequirementSchema,
  tokenGateStateSchema,
  unixMsSchema
} from "./schemas";

export type UnixMs = z.infer<typeof unixMsSchema>;

export type Candle = z.infer<typeof candleSchema>;

export type IndicatorValue = z.infer<typeof indicatorPointSchema>["value"];
export type IndicatorPoint = z.infer<typeof indicatorPointSchema>;
export type IndicatorSeries = z.infer<typeof indicatorSeriesSchema>;

export type RegimeClassification = z.infer<typeof regimeClassificationSchema>;
export type FeatureImportance = z.infer<typeof featureImportanceSchema>;

export type AIInferenceRequest = z.infer<typeof aiInferenceRequestSchema>;
export type AIInferenceResponse = z.infer<typeof aiInferenceResponseSchema>;
export type ProbabilityMap = AIInferenceResponse["probabilities"];

export type SnapshotResponse = z.infer<typeof snapshotResponseSchema>;

export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;

export type RewardStatus = z.infer<typeof rewardStatusSchema>;
export type RewardEntry = z.infer<typeof rewardEntrySchema>;
export type RewardsSnapshot = z.infer<typeof rewardsSnapshotSchema>;

export type TokenGateRequirement = z.infer<typeof tokenGateRequirementSchema>;
export type TokenGateState = z.infer<typeof tokenGateStateSchema>;
