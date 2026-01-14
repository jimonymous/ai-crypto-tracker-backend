# API Environment Setup

This guide explains how to fill `apps/api/.env` (copy from `.env.example` first) and what each variable does.

## Core services
- `DATABASE_URL` — Postgres connection string. Example: `postgresql://postgres:postgres@localhost:5432/crypto_tracker`.
- `REDIS_URL` — Redis connection string. Example: `redis://localhost:6379`.
- `API_PORT` — API listen port (default `4000`).
- `CORS_ORIGIN` — comma-separated origins allowed for CORS. Use `*` only for local dev.
- `LOG_LEVEL` — `info`/`debug`/`warn`/`error`.

## Auth & security
- `JWT_SECRET` — required. Set to a strong random string; used to sign access tokens.
- `JWT_EXPIRES_IN` — e.g. `15m`.
- `REFRESH_TOKEN_EXPIRES_IN` — e.g. `30d`.
- `OAUTH_GOOGLE_CLIENT_ID` — optional Google OAuth client ID.
- `PII_ENCRYPTION_KEY` — 32-byte hex/utf-8 key for encrypting compliance references.
- `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` — e.g. `100` and `1 minute`.

## AI service
- `AI_SERVICE_URL` — API endpoint for the AI service (default `http://localhost:8000`).
- `AI_AUTH_TOKEN` — if set in the AI service, the API must send `Authorization: Bearer <token>`; set the same value in API via `AI_AUTH_TOKEN` as well so it forwards the header.
- Artifacts: inference/scheduler runs only if models exist in `apps/ai/artifacts`. Train via `POST /ai/train/from-db` after ingesting candles.

## Chain / billing / rewards
- Single-chain fallback:
  - `CHAIN_ID` — e.g. `31337` for local Hardhat.
  - `CHAIN_RPC_URL` — e.g. `http://localhost:8545`.
  - `CHAIN_DEPLOYMENT` — path to a deployment JSON (e.g. `apps/chain/deployments/hardhat.json`).
- Multi-chain (preferred for live): set `MULTICHAIN_JSON` to a JSON array of chains:
  ```
  MULTICHAIN_JSON=[{"id":1,"name":"mainnet","rpcUrl":"https://mainnet.infura.io/v3/<key>","tokenAddress":"0x...","premiumPassAddress":"0x...","rewardsAddress":"0x...","treasuryAddress":"0x..."}]
  ```
  Sanitized to http/https only.
- ACT token economics:
  - `ACT_PRICE_PER_CALL` — cost per access period in ACT (wei string).
  - `ACT_ACCESS_PERIOD_MINUTES` — minutes per access period.
  - `TOKEN_ADDRESS`, `TOKEN_DECIMALS`, `PREMIUM_PASS_ADDRESS`, `REWARDS_CONTRACT_ADDRESS`, `ACT_TREASURY_ADDRESS` — set per chain (overridden by `MULTICHAIN_JSON` if provided).
- Server signing key:
  - `CHAIN_PRIVATE_KEY` — needed for billing/permit/treasury operations and staking/gov flows in tests. Use a funded key on the target chain (local Hardhat key for dev).

## RPCs for live reads (DEX/arb/wallet live tests)
Set when hitting mainnet/testnets for DEX/arb/wallet live endpoints:
- `ETH_MAINNET_RPC`
- `POLYGON_MAINNET_RPC`
- `BSC_MAINNET_RPC`
- `ARBITRUM_MAINNET_RPC`
- `OPTIMISM_MAINNET_RPC`
- `AVALANCHE_MAINNET_RPC`
- `BASE_MAINNET_RPC`
Leave blank to skip those networks. Only http/https endpoints are accepted.

## Scheduler / workers
- `API_DISABLE_WORKERS` — set `true` to disable queue workers inside the API process.
- `API_DISABLE_SCHEDULER` — set `true` to disable the scheduler inside the API process (run it separately in production).
- `QUEUE_PREFIX` — optional BullMQ prefix (default `crypto-tracker` in dev/tests).

## Email / webhook (optional)
- `EMAIL_FROM`, `SMTP_URL` — if you enable email.
- `WEBHOOK_URL` — optional outbound notifications.

## Local Hardhat vs live RPC
- Integration tests in `apps/api` assume you already run a Hardhat node in another shell:
  ```
  cd apps/chain
  npx hardhat node --hostname 127.0.0.1 --port 8545
  ```
  They reuse `apps/chain/deployments/hardhat.json` and do not start their own node.
- DEX/arb/history endpoints always read from live RPCs; ensure the `*_MAINNET_RPC` values above are set and within your rate limits.

## Minimal local dev example (`apps/api/.env`)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crypto_tracker
REDIS_URL=redis://localhost:6379
API_PORT=4000
JWT_SECRET=replace-me
AI_SERVICE_URL=http://localhost:8000
CHAIN_ID=31337
CHAIN_RPC_URL=http://localhost:8545
CHAIN_DEPLOYMENT=apps/chain/deployments/hardhat.json
ACT_PRICE_PER_CALL=1000000000000000000
ACT_ACCESS_PERIOD_MINUTES=60
TOKEN_ADDRESS=0xYourToken
TOKEN_DECIMALS=18
PREMIUM_PASS_ADDRESS=0xYourPass
REWARDS_CONTRACT_ADDRESS=0xYourRewards
ACT_TREASURY_ADDRESS=0xYourTreasury
CHAIN_PRIVATE_KEY=0xac0974... # Hardhat default key for local
```

## Common mistakes
- Missing JWT_SECRET or weak PII_ENCRYPTION_KEY.
- Leaving RPC URLs blank when running live DEX/arb tests (they will skip or rate-limit).
- Not training AI models before calling `/ai/chat`/`/ai/infer`; ensure artifacts exist.
- Running API tests without a Hardhat node already running on 127.0.0.1:8545.
