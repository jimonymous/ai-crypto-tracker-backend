# AI Crypto Tracker – Repository & API Overview

## Workspaces
- `apps/api` — Fastify API with Prisma/Postgres, Redis/BullMQ, WebSockets, OpenAPI. Domains: auth, billing/premium, rewards, markets/snapshots, portfolio, wallet balances, alerts, compliance, AI proxy.
- `apps/ai` — FastAPI + LightGBM; deep-model stubs (LSTM/Transformer), backtesting, feature builders, model storage.
- `apps/chain` — Hardhat + TypeChain; ACT ERC20 (permit), premium pass, rewards Merkle, treasury/LP/staking/gov stubs, deploy scripts, tests.
- `packages/shared` — Shared TS types + Zod schemas (candles, indicators, AI, auth, rewards, gating).
- `apps/web` — Vite/Tailwind frontend shell (placeholder; see frontend docs for wiring).
- `infra/docker` — Postgres/Redis compose setup.
- Env reference: see `apps/api/docs/ENV.md` for filling API `.env` (DB/Redis, chain RPCs, AI, billing, scheduler).

## Core Flows
1) Ingestion: CCXT fetches OHLCV into Postgres → indicators computed/stored → snapshots cached in Redis.
2) AI: AI service trains/infers on candle + indicator features; API proxies inference/training/backtest and stores predictions.
3) Real-time: WebSocket `/ws/updates` pushes snapshots/alerts; Redis pub/sub for fan-out.
4) Billing/premium: ACT token-based access pass (period-based). Payment via auto-charge (transferFrom), txHash verification, or permit to FeeTreasury. Premium gating via token/NFT balance checks.
5) Rewards: accrual records → Merkle root publish → proofs served for claim UI.
6) Compliance: stub KYC provider with encrypted PII references; configurable provider hook.
7) DEX + arb: allowlisted v2/v3 pools per chain feed on-chain spot/reserve reads; arb finder scans cycles and returns unsigned calldata/multicall for signing. Candle/arb history builders hit live RPCs only (no price APIs).

## Auth & Security
- JWT + refresh; optional Google OAuth; optional TOTP 2FA.
- Helmet + rate limiting; Zod-validated env config; PII encryption helper.

## Chain Integration
- viem public/wallet clients; multi-chain via `MULTICHAIN_JSON` plus per-request `chainId`/`rpcUrl` (http/https sanitized; env RPC fallback).
- Contracts: ACT ERC20 (permit), PremiumPass, RewardsMerkle, FeeTreasury, LP/treasury/staking/governance stubs. Tests cover permit flows/treasury/LP/staking/gov.
- Endpoints: `/premium/status`, `/wallet/balances`, `/billing/*`, `/rewards/*`, `/chains`.

## Data & AI Endpoints (API)
- Markets & data: `/snapshot`, `/markets`, `/markets/stats`; DEX data via `/dex/quote` (allowlisted v2/v3), `/dex/spot`, `/dex/pool/reserves`, `/dex/history` (on-chain historical samples), `/dex/candles` (on-the-fly OHLC from on-chain spots), `/dex/routers` (allowlisted v2/v3 router/quoter addresses); external CoinGecko/Binance passthroughs are disabled—use on-chain/DEX data.
- Portfolio: `/portfolio/holdings`.
- Wallet: `/wallet/balances`.
- Alerts: `/alerts` CRUD; WebSocket `/ws/updates`.
- AI: `/ai/chat` (pulls latest candles/indicators and calls AI), `/ai/infer`, `/ai/train`, `/ai/train/deep`, `/ai/backtest`, `/ai/train/from-db` (all JWT + access-pass gated; requires artifacts on disk—train first).
- Billing: `/billing/price`, `/billing/purchase`.
- Premium/Rewards: `/premium/status`, `/rewards/epoch/latest`, `/rewards/proof`, `/rewards/history`.
- Indicators: `/indicators/rating` combines enabled indicators (toggle/weights) into a composite buy/sell score.
- Arbitrage: `/arb/cycles` finds profitable allowlisted cycles, adds shelf life/TTL, bankroll guidance, and unsigned calldata/multicall for signing; `/arb/history` scans historical blocks for past cycle opportunities.
- Health/Docs: `/health`, `/docs` (Swagger UI) and `/docs/json` (OpenAPI JSON for codegen and client generation).

## Indicators & Defaults
- Indicators: EMA20/50/200, SMA50/200, RSI14, MACD(12/26/9), Bollinger(20,2), ATR14, VWAP + bands, Donchian20/55, HV20/30, Volume z-score20.
- WBTC defaults: `/ai/chat` defaults to `WBTC/USDT` if no symbol is provided; seed WBTC markets (e.g., `WBTC/USDT` for `1h`/`4h`) so candles/indicators/AI outputs exist.

## Billing & Access
- ACT access pass priced per period (`ACT_PRICE_PER_CALL`, `ACT_ACCESS_PERIOD_MINUTES`).
- Payment modes: auto-charge (requires allowance), txHash verification to treasury, or permit to FeeTreasury.
- Access is required for AI endpoints.
- Deploy notes: see `docs/CHAIN_DEPLOY.md` for multi-chain deployments, permit-ready token/treasury, and pricing knobs.

## Testing
- API: `npm run test --workspace apps/api` (Vitest). Start a Hardhat node in another shell first (`cd apps/chain && npx hardhat node --hostname 127.0.0.1 --port 8545`); tests reuse that deployment instead of spawning one. Typecheck with `npm run typecheck --workspace apps/api`.
- Chain: `npm run test --workspace apps/chain`, `npm run compile --workspace apps/chain`.
- AI: (from `apps/ai`) `pytest`.
- Shared types: `npm run typecheck --workspace packages/shared`.

## Frontend Wiring (examples)
- Snapshot: `GET /snapshot?symbol=BTC/USDT&timeframe=1h`.
- WebSocket: connect to `/ws/updates`, subscribe with `{"type":"subscribe","symbol":"BTC/USDT","timeframe":"1h"}`.
- Billing: `GET /billing/price?chainId=...`, `POST /billing/purchase` with JWT (+ optional txHash/permit).
- AI chat: `POST /ai/chat` with JWT + `{ message, symbol?, timeframe?, horizonMinutes?, chainId?, rpcUrl?, modelVersion? }` (defaults to `WBTC/USDT` + `1h`; live inference runs only when local `v1_*.pkl` artifacts exist; otherwise the latest cached prediction is returned).
- Wallet: `GET /wallet/balances?address=0x...&chainId=...`.
