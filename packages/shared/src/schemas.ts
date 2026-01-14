import { z } from "zod";

export const unixMsSchema = z.number().int().nonnegative();

export const candleSchema = z.object({
  timestamp: unixMsSchema,
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number()
});

const indicatorValueSchema = z.union([
  z.number(),
  z.record(z.string(), z.number()),
  z.null()
]);

export const indicatorPointSchema = z.object({
  timestamp: unixMsSchema,
  value: indicatorValueSchema
});

export const indicatorSeriesSchema = z.object({
  name: z.string(),
  source: z.string().optional(),
  params: z.record(z.union([z.string(), z.number()])).optional(),
  values: z.array(indicatorPointSchema)
});

export const regimeClassificationSchema = z.object({
  label: z.string(),
  confidence: z.number().min(0).max(1),
  rationale: z.array(z.string()).optional()
});

export const featureImportanceSchema = z.object({
  feature: z.string(),
  importance: z.number()
});

export const aiInferenceRequestSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  horizonMinutes: z.number().int().positive(),
  asOf: unixMsSchema.optional(),
  candles: z.array(candleSchema).optional(),
  indicators: z.array(indicatorSeriesSchema).optional(),
  requestId: z.string().optional()
});

export const aiInferenceResponseSchema = z.object({
  requestId: z.string().optional(),
  symbol: z.string(),
  timeframe: z.string(),
  horizonMinutes: z.number().int().positive(),
  asOf: unixMsSchema,
  probabilities: z
    .object({
      pUp: z.number().min(0).max(1).optional(),
      pDown: z.number().min(0).max(1).optional(),
      pHighVol: z.number().min(0).max(1).optional()
    })
    .catchall(z.number().min(0).max(1)),
  regime: regimeClassificationSchema.optional(),
  featureImportances: z.array(featureImportanceSchema).optional(),
  rationale: z.array(z.string()).optional()
});

export const snapshotResponseSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  asOf: unixMsSchema,
  candles: z.array(candleSchema),
  indicators: z.array(indicatorSeriesSchema),
  ai: aiInferenceResponseSchema.optional()
});

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email().optional(),
  walletAddress: z.string().optional(),
  roles: z.array(z.string()).optional(),
  premiumSince: unixMsSchema.optional()
});

export const authSessionSchema = z.object({
  sessionId: z.string(),
  user: authUserSchema,
  issuedAt: unixMsSchema,
  expiresAt: unixMsSchema,
  token: z.string().optional()
});

export const rewardStatusSchema = z.enum(["pending", "claimable", "claimed", "expired"]);

export const rewardEntrySchema = z.object({
  id: z.string(),
  cycle: z.string(),
  token: z.string(),
  amount: z.string(),
  claimableAt: unixMsSchema,
  expiresAt: unixMsSchema.optional(),
  merkleProof: z.array(z.string()).optional(),
  txHash: z.string().optional(),
  status: rewardStatusSchema
});

export const rewardsSnapshotSchema = z.object({
  walletAddress: z.string(),
  chainId: z.number().int(),
  updatedAt: unixMsSchema,
  rewards: z.array(rewardEntrySchema)
});

export const tokenGateRequirementSchema = z.object({
  chainId: z.number().int(),
  minTokenBalance: z.string().optional(),
  tokenAddress: z.string().optional(),
  tokenSymbol: z.string().optional(),
  minNftBalance: z.number().int().optional(),
  nftAddress: z.string().optional(),
  role: z.string()
});

export const tokenGateStateSchema = z.object({
  walletAddress: z.string(),
  chainId: z.number().int(),
  eligible: z.boolean(),
  satisfied: z.array(tokenGateRequirementSchema),
  missing: z.array(tokenGateRequirementSchema),
  checkedAt: unixMsSchema
});
