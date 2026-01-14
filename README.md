# AI Crypto Tracker Monorepo

Backend-first starter for the AI-driven crypto tracker: Fastify API, AI inference service, Hardhat contracts, and shared schemas. Frontend exists but the focus here is delivering a production-ready, plug-and-play backend that frontend engineers can wire to immediately. The token contract ships as CryptoTracker Token (`CTT`, branded “ACT” in docs/UI); align copy with the on-chain symbol.

## What’s inside (backend focus)
- **API (apps/api)**: Fastify, Prisma/Postgres, Redis/BullMQ, WebSocket push, OpenAPI docs (`/docs`), auth (JWT + Google OAuth + optional TOTP), alerts, billing with the CTT/ACT token, premium gating, rewards, wallet balances, market data passthroughs, portfolio CRUD, and AI/chat endpoints.
- **AI service (apps/ai)**: FastAPI + LightGBM with LSTM/Transformer stubs, backtesting, feature builders, and inference endpoints.
- **Chain (apps/chain)**: Hardhat + TypeChain, ACT ERC20 (permit), premium pass, rewards Merkle, treasury, LP/staking/governance stubs; deploy + tests.
- **Shared (packages/shared)**: Types + Zod schemas for candles, indicators, snapshots, auth, rewards, gating.
- **Web (apps/web)**: Vite/Tailwind frontend shell (placeholder) — see frontend docs for integration.
- Full repo overview: `docs/OVERVIEW.md`.

## Environment setup
1) Install deps: `npm install`
2) Infra: `docker compose up -d` (Postgres + Redis)
   Change Directory: `cd apps/api`
   Set .env: `cp .env.example .env`
   Prisma Migrate: `npm run prisma:migrate`
   Prisma Seed: `npm run prisma:seed`
3) Root `.env` (used by Docker defaults):
   ```
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   POSTGRES_DB=crypto_tracker
   POSTGRES_PORT=5432
   POSTGRES_HOST=localhost
   DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_URL=redis://${REDIS_HOST}:${REDIS_PORT}
   API_PORT=4000
   WEB_PORT=5173
   AI_PORT=8000
   AI_SERVICE_URL=http://localhost:${AI_PORT}
   ```
4) API `.env` (copy from `apps/api/.env.example`): set `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `AI_SERVICE_URL`, `CHAIN_RPC_URL`/`CHAIN_ID` **or** `MULTICHAIN_JSON`, contract addresses (token/premiumPass/rewards/treasury), `CHAIN_PRIVATE_KEY` (for permit/treasury ops), and pricing knobs `ACT_PRICE_PER_CALL`/`ACT_ACCESS_PERIOD_MINUTES`.
   - Ops flags: `API_DISABLE_WORKERS=false`, `API_DISABLE_SCHEDULER=false` (set to `true` when running workers/scheduler as separate processes).
5) AI `.env`: point to Postgres if training against stored data; optional S3 path for models. Set `AI_AUTH_TOKEN` to require `Authorization: Bearer <token>` on all AI endpoints.
6) Chain `.env` (Hardhat): RPC URLs/private keys for deploy scripts if targeting testnets.

## Running locally
- Infra: `docker compose up -d` (Postgres/Redis).
- API dev: `npm run dev` (WSL; starts Fastify API only).
- AI dev: `cd apps/ai && source .venv/bin/activate && npm run dev` (separate shell).
- Chain dev: `cd apps/chain && npm run dev` (starts Hardhat node + deploys locally on 127.0.0.1:8545). Integration tests reuse that running node/deployments—they do **not** spin up Hardhat themselves.
- See `docs/LOCAL_API_RPC_RUNBOOK.md` for full commands, RPC expectations (live DEX vs local Hardhat), example curl calls, and test invocations (including `/dex/history` and `/arb/history`).
- `docker compose down` — stop infra (volumes persist)
- API docs: OpenAPI/Swagger UI at `http://localhost:4000/docs` (Fastify swagger). The JSON spec is at `/docs/json` for client codegen.
- Optional: enable market-data backups to survive DB restarts:
  - Set env: `RESTORE_MARKET_BACKUP_ON_BOOT=true` and/or `BACKUP_MARKET_DATA_ON_START=true` (optional `MARKET_BACKUP_PATH=./data/market-backup.json`).
  - Run API with: `RESTORE_MARKET_BACKUP_ON_BOOT=true BACKUP_MARKET_DATA_ON_START=true npm run dev` (from repo root; defaults to `./data/market-backup.json`).

## Tests & type checks
- JS/TS:
  - API tests (Vitest): `npm run test --workspace apps/api` (start a Hardhat node in another shell first: `cd apps/chain && npx hardhat node --hostname 127.0.0.1 --port 8545`)
  - Chain tests (Hardhat): `npm run test --workspace apps/chain`
  - Typechecks: `npm run typecheck:js`
  - Additional API coverage includes snapshot, markets, wallet, billing/chat/rewards routes, and indicators.
  - Frontend examples: see `docs/FRONTEND_TESTS.md` for Vite + React + Tailwind testing patterns (Testing Library, MSW mocks).
- Python (AI):
  - From `apps/ai`: `npm run test` (Windows/CMD-friendly; creates venv, installs deps, runs pytest, then compileall)
  - If using Git Bash/WSL, activate manually instead:
    ```
    py -3.10 -m venv .venv
    source .venv/Scripts/activate     # or .venv\Scripts\activate on cmd/PowerShell
    python -m pip install -r requirements.txt
    python -m pip install pytest
    python -m pytest -q
    python -m compileall backtest.py dataset.py features.py infer.py main.py models.py models_dl.py storage.py train.py tests
    ```
  - From repo root: `npm run test:ai` or `npm run typecheck --workspace apps/ai` (uses the same flow).
- Shared types: `npm run typecheck --workspace packages/shared`
- Note: run JS/TS tasks in WSL2 or native Node—WSL1 is unsupported by the toolchain. Run AI tasks in your Python 3.10 venv to avoid build issues.

## Indicators
- Implemented server-side for AI/chat, alerts, and snapshots. See `docs/INDICATORS.md` for formulas, warmup behavior, and golden sanity expectations.
- Tests: `apps/api/src/ta/indicators.test.ts` (smoke) and `apps/api/src/ta/indicators.golden.test.ts` (flat-series golden values).

## Trading & Portfolio (Binance starter)
- Store encrypted exchange API keys (`/exchange/keys`), fetch balances (`/exchange/balances`), and aggregate multi-exchange stubs (`/portfolio/aggregate`).
- Paper trading endpoints (`/exchange/paper/orders`) for simulated orders.
- Risk endpoints: `/risk/metrics` (volatility/VaR-like), `/risk/alerts` (drawdown-based), `/risk/pnl` (cumulative timeline).

## Running in production
- Separate concerns: run the Fastify API without embedded workers/scheduler by setting `API_DISABLE_WORKERS=true` and/or `API_DISABLE_SCHEDULER=true`, then run dedicated worker and scheduler processes (see `apps/api/src/queues/workers` and `apps/api/src/queues/schedule`).
- Protect AI service: set `AI_AUTH_TOKEN` and require `Authorization: Bearer <token>`; keep it behind the API or a private network.

## Multi-chain & RPC override
- Configure multiple chains via `MULTICHAIN_JSON` (array of `{ id, name, rpcUrl, tokenAddress, premiumPassAddress, rewardsAddress, treasuryAddress, decimals?, minBalance? }`). Falls back to `CHAIN_ID`/`CHAIN_RPC_URL` if unset.
- Per-request overrides: pass `chainId` (and optional `rpcUrl`) on wallet/premium/billing/ai chat/rewards endpoints. RPC override accepts only http/https URLs; env RPC is used when none is provided. This lets you honor the user’s selected MetaMask network while keeping an env fallback.

## Market data & indicators
- **Tracked data**: OHLCV, volume, VWAP, realized/historical vol windows, market stats (24h change/volume, dominance) sourced from on-chain/DEX allowlisted pools.
- **Indicators (battle-tested set)**: EMA 20/50/200, SMA 50/200, RSI14, MACD (12,26,9), Bollinger (20,2), ATR14, VWAP + bands, Donchian 20/55, HV 20/30, Volume z-score 20. Combos used for AI/features and alerts (e.g., EMA stack + MACD hist slope, BB width + ATR, RSI slope + Donchian breakout).
- **Defaults**: Snapshot requires `symbol` and `timeframe`. Chat defaults to `WBTC/USDT` and `1h` when not provided; ensure those markets are seeded so candles/indicators/AI outputs exist.
- **On-chain candle ingestion**: To backfill allowlisted DEX pools into Postgres, POST `/dex/ingest/allowlist` with optional `{ chainId, windowMinutes, intervalSeconds, maxBlocks, minSamples, rateLimitPerSec }`. Jobs are queued (BullMQ) and use live RPC; adjust `rateLimitPerSec` to stay within your provider limits.

## Frontend wiring examples
- Snapshot for charts/AI: `GET /snapshot?symbol=BTC/USDT&timeframe=1h` (symbol required)
- WebSocket stream: connect to `/ws/updates`, send `{"type":"subscribe","symbol":"BTC/USDT","timeframe":"1h"}` to receive snapshots + `{type:"alert"}` pushes.
- Billing/access pass: `GET /billing/price?chainId=...`, `POST /billing/purchase` with JWT + optional `txHash` or `permit`; access grants period-based usage (1 ACT per period).
- Premium status: `GET /premium/status?address=0x...&chainId=...&rpcUrl=...`
- Wallet balances: `GET /wallet/balances?address=0x...&chainId=...`
- AI chat: `POST /ai/chat` with JWT + active access pass + `{ message, symbol?, timeframe?, horizonMinutes?, chainId?, rpcUrl?, modelVersion? }` (defaults to `WBTC/USDT` + `1h`). The API runs live inference only when local artifacts exist (current check looks for `v1_*.pkl`); otherwise it returns the latest cached prediction.
- AI inference/train/backtest: `POST /ai/infer`, `/ai/train`, `/ai/train/deep`, `/ai/backtest` with JWT + access pass; body includes `{ symbol, timeframe, horizonMinutes, candles, indicators?, chainId?, rpcUrl? }`.
- MetaMask wiring examples for passing `chainId`/`rpcUrl`: see `docs/FRONTEND_SNIPPETS.md`.

## Notes & best practices
- Code is structured by domain with minimal comments; see `apps/api/docs/API.md` for endpoint details and `apps/api/README.md` for setup specifics.
- Business logic lives off-chain; chain usage is limited to gating, billing, rewards, and staked/LP stubs.
- Security: helmet + rate limits, JWT/refresh, optional TOTP/OAuth; KYC stub with encrypted references; ACT billing verifies transfers/permits/allowance.
- Indicators and AI run server-side only; frontend consumes APIs and sockets—no client-side finance math required.
- AI inference requires trained artifacts per market/timeframe. Generate artifacts via `POST /ai/train/from-db` (or `ai/train`) after candles exist; scheduler only runs AI for markets with artifacts present in `apps/ai/artifacts`.
- Detailed API env filling guide: `apps/api/docs/ENV.md`.
