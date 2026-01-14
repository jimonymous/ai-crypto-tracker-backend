import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  API_DISABLE_WORKERS: z.coerce.boolean().default(false),
  API_DISABLE_SCHEDULER: z.coerce.boolean().default(false),
  CORS_ORIGIN: z.string().default("*"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  QUEUE_PREFIX: z.string().default("crypto-tracker"),
  AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  CHAIN_RPC_URL: z.string().default("http://localhost:8545"),
  ETH_MAINNET_RPC: z.string().optional(),
  ETH_SEPOLIA_RPC: z.string().optional(),
  POLYGON_MAINNET_RPC: z.string().optional(),
  POLYGON_AMOY_RPC: z.string().optional(),
  BSC_MAINNET_RPC: z.string().optional(),
  ARBITRUM_MAINNET_RPC: z.string().optional(),
  OPTIMISM_MAINNET_RPC: z.string().optional(),
  AVALANCHE_MAINNET_RPC: z.string().optional(),
  BASE_MAINNET_RPC: z.string().optional(),
  CHAIN_ID: z.coerce.number().int().default(31337),
  CHAIN_DEPLOYMENT: z.string().default("local"),
  TOKEN_ADDRESS: z.string().default("0x0000000000000000000000000000000000000000"),
  TOKEN_DECIMALS: z.coerce.number().int().default(18),
  TOKEN_MIN_BALANCE: z.string().default("0"),
  PREMIUM_PASS_ADDRESS: z.string().default("0x0000000000000000000000000000000000000000"),
  REWARDS_CONTRACT_ADDRESS: z.string().default("0x0000000000000000000000000000000000000000"),
  CHAIN_PRIVATE_KEY: z.string().optional(),
  REWARD_TOKEN_SYMBOL: z.string().default("CTT"),
  REWARD_EPOCH_MINUTES: z.coerce.number().int().default(60 * 24),
  ACT_PRICE_PER_CALL: z.string().default("1"),
  ACT_ACCESS_PERIOD_MINUTES: z.coerce.number().int().default(60 * 24),
  OAUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  ACT_TREASURY_ADDRESS: z.string().default("0x0000000000000000000000000000000000000000"),
  RATE_LIMIT_MAX: z.coerce.number().int().default(1000),
  RATE_LIMIT_WINDOW: z.coerce.number().int().default(60_000),
  DEX_QUOTE_CACHE_SECONDS: z.coerce.number().int().default(30),
  KYC_PROVIDER: z.string().default("stub"),
  MULTICHAIN_JSON: z.string().default("[]"),
  AI_AUTH_TOKEN: z.string().optional(),
  CHAT_SYSTEM_PROMPT: z.string().optional()
});

type Env = z.infer<typeof envSchema>;

const parseEnv = (): Env => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    throw new Error(`Invalid environment variables: ${JSON.stringify(formatted, null, 2)}`);
  }
  return result.data;
};

const parsed = parseEnv();

const corsOrigins =
  parsed.CORS_ORIGIN === "*"
    ? "*"
    : parsed.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

export type AppConfig = Env & {
  corsOrigins: "*" | string[];
  isProduction: boolean;
  isTest: boolean;
  logLevel: Env["LOG_LEVEL"];
};

export const config: AppConfig = {
  ...parsed,
  corsOrigins,
  isProduction: parsed.NODE_ENV === "production",
  isTest: parsed.NODE_ENV === "test",
  logLevel: parsed.LOG_LEVEL
};
