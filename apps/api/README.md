## Crypto Tracker API – Backend Reference

This directory houses the Fastify API for ingestion, indicators, AI predictions, auth, premium gating, rewards, portfolios, alerts, billing, compliance, and on-chain/DEX-aligned market data.

### Getting started
- Install deps from repo root: `npm install`
- Migrate/seed: `npm run prisma:migrate --workspace apps/api` then `npm run prisma:seed --workspace apps/api`
  - Tests use mocks and won’t populate your dev DB; for local AI inference, seed first, start the API with scheduler enabled so candles/indicators backfill for seeded markets (e.g., WBTC/USDT), then call `/ai/train/from-db?symbol=WBTC/USDT&timeframe=1h` to write artifacts to `apps/ai/artifacts`.
- Env: copy `.env.example` to `.env` and fill DB/Redis/AI/chain/JWT/OAuth/treasury/PII secrets. See `docs/ENV.md` for a detailed field-by-field guide. Key vars (token contract symbol is `CTT`, branded “ACT”):
  - DB/Redis: `DATABASE_URL`, `REDIS_URL`
  - API: `API_PORT`, `CORS_ORIGIN`, `LOG_LEVEL`
  - Auth: `JWT_SECRET`, `JWT_EXPIRES_IN`, optional `OAUTH_GOOGLE_CLIENT_ID`
  - AI: `AI_SERVICE_URL`
  - Chain/billing: `CHAIN_RPC_URL`, `CHAIN_ID`, `CHAIN_DEPLOYMENT`, `MULTICHAIN_JSON` (array of chains), `TOKEN_ADDRESS`, `TOKEN_DECIMALS`, `PREMIUM_PASS_ADDRESS`, `REWARDS_CONTRACT_ADDRESS`, `ACT_TREASURY_ADDRESS`, `CHAIN_PRIVATE_KEY`
    - If you hit live/testnet nodes, set `ETH_MAINNET_RPC`, `ETH_SEPOLIA_RPC`, `POLYGON_MAINNET_RPC`, `POLYGON_AMOY_RPC`; leave blank for local hardhat.
  - Billing model: `ACT_PRICE_PER_CALL`, `ACT_ACCESS_PERIOD_MINUTES`
  - Security: `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`, `PII_ENCRYPTION_KEY`
  - Compliance: `KYC_PROVIDER` (stub by default)
- Run dev: `npm run dev --workspace apps/api` (Redis/Postgres required; `docker compose up -d`)
- AI service: `npm run dev --workspace apps/ai`
- Swagger docs: http://localhost:4000/docs

### Multi-chain & RPC override
- Configure multiple networks with `MULTICHAIN_JSON` or fall back to `CHAIN_ID`/`CHAIN_RPC_URL`.
- Endpoints `/wallet/balances`, `/premium/status`, `/billing/price`, `/billing/purchase`, `/ai/chat`, and `/rewards/proof` accept optional `chainId` and `rpcUrl` (http/https only). If omitted, env chain is used. This lets you honor the user’s selected MetaMask network while keeping a safe default RPC.

### Key features
- Ingestion: on-chain/DEX aligned markets (no CoinGecko/Binance passthrough), indicator computation (EMA/RSI/MACD/BB/ATR/VWAP), BullMQ/Redis scheduler, cached snapshots.
- AI: FastAPI + LightGBM, optional LSTM/Transformer stubs, backtest metrics; API integrates inference/jobs. Inference/scheduler only run for markets with artifacts present in `apps/ai/artifacts`—train first via `/ai/train` or `/ai/train/from-db`. Chat will attempt live inference only if `v1_*.pkl` artifacts exist locally; otherwise it falls back to the latest cached prediction. The AI service itself resolves the highest available model version when `modelVersion` is omitted.
- Auth: JWT + refresh, email/password, Google OAuth, optional TOTP 2FA.
- Billing: ACT token access passes (period-based). Payment via auto-charge (transferFrom), txHash verification to treasury, or permit to FeeTreasury.
- Premium/Rewards: token/NFT gating, rewards accrual + Merkle publish, proof/history endpoints.
- Portfolio/Markets: holdings CRUD + valuation, markets/stats, snapshot endpoint, DEX-aligned data (no external CoinGecko/Binance proxies).
- Real-time: WebSocket `/ws/updates` (snapshots + alerts), alert CRUD + evaluation worker.
- Compliance: Stub KYC provider with start/status/verify; PII encryption helper.
- Security: helmet, rate limiting, encrypted references; configurable limits.

### Key endpoints (see `docs/API.md` for details)
- `GET /health`
- Auth: `/auth/register`, `/auth/login`, `/auth/oauth/google`, `/auth/refresh`, `/auth/totp/*`, `/auth/me`
- Markets: `/markets`, `/markets/stats`, `/snapshot`
- Portfolio: `/portfolio/holdings`
- Wallet: `/wallet/balances`
- External data passthroughs disabled (CoinGecko/Binance removed); use on-chain/DEX data via `/markets`, `/snapshot`, `/dex/*`, `/arb/*`.
- AI/chat: `/ai/chat` (requires access pass; optional `modelVersion`, defaults to latest), `/ai/infer`, `/ai/train`, `/ai/train/from-db`, `/ai/train/deep`, `/ai/backtest` (all gated); AI service also exposes `/train`, `/train/deep`, `/infer`, `/backtest`. Requests return 503 when no artifacts/cache are available.
- Billing: `/billing/price`, `/billing/purchase` (auto-charge, txHash verify, or permit)
- Premium: `/premium/status`
- Rewards: `/rewards/epoch/latest`, `/rewards/proof`, `/rewards/history`
- Alerts: `/alerts` CRUD; WS `/ws/updates`
- Compliance: `/compliance/kyc/start`, `/compliance/kyc/status`, `/compliance/kyc/verify`

### Smoke checks
Example REST calls live in `scripts/smoke.http`. After dev server is running, use VS Code REST/Postman. Replace `<token>` with a JWT; for billing, supply `txHash` or permit if auto-charge is unavailable.

### Frontend/middleware docs
- For Vite/Tailwind integration, see `docs/FRONTEND_MIDDLEWARE.md`, `docs/FRONTEND_MIDDLEWARE_CLIENT.md`, `docs/FRONTEND_ENV.md`, and snippets in `docs/FRONTEND_SNIPPETS.md`.

### Markets (BTC coverage)
- Seed or insert core markets (e.g., `WBTC/USDT` with `1h`/`4h` timeframes) before running schedulers. Chat defaults to `WBTC/USDT` if no symbol is provided, so having WBTC markets seeded ensures candles/indicators/AI outputs are present.

### Running tests
- API tests (Vitest): `npm run test --workspace apps/api` (start a Hardhat node first: in another shell run `cd apps/chain && npx hardhat node --hostname 127.0.0.1 --port 8545`)
- Chain (Hardhat): `npm run test --workspace apps/chain` (also does TypeChain; compile via `npm run compile --workspace apps/chain`)
- AI (pytest): from `apps/ai`, install Python deps then `pytest`
- Type checks: `npm run typecheck --workspace apps/api`, `npm run typecheck --workspace packages/shared`, `npx tsc --noEmit -p apps/chain/tsconfig.json`
- Tooling note: run these in WSL2 or native Node (WSL1 is unsupported).

### Frontend wiring examples
- Snapshot for charts/indicators/predictions:
  ```ts
  const res = await fetch("/snapshot?symbol=BTC/USDT&timeframe=1h");
  const data = await res.json(); // { candles, indicators, ai, asOf }
  ```
- WebSocket stream (snapshots + alerts):
  ```ts
  const ws = new WebSocket("ws://localhost:4000/ws/updates");
  ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", symbol: "BTC/USDT", timeframe: "1h" }));
  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.type === "snapshot") { /* update chart */ }
    if (msg.type === "alert") { /* notify user */ }
  };
  ```
- Auth + JWT (fetch wrapper):
  ```ts
  const login = await fetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }), headers: { "Content-Type": "application/json" }});
  const { token, refreshToken } = await login.json();
  const authedFetch = (url, opts={}) => fetch(url, { ...opts, headers: { ...(opts.headers||{}), Authorization: `Bearer ${token}` }});
  ```
- Billing + AI access:
  ```ts
  await authedFetch("/billing/purchase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ /* optionally txHash or permit */ }) });
  const chat = await authedFetch("/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Outlook?", symbol: "BTC/USDT", timeframe: "1h" })});
  const chatData = await chat.json();
  ```
- Wallet balances:
  ```ts
  const res = await fetch(`/wallet/balances?address=${walletAddress}`);
  const { balances } = await res.json();
  ```
- Portfolio upsert/fetch:
  ```ts
  await fetch("/portfolio/holdings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet, assetSymbol: "BTC", quantity: 0.1, averageCost: 30000 })});
  const holdings = await (await fetch(`/portfolio/holdings?wallet=${wallet}`)).json();
  ```

### Conventions & practices
- Minimal comments; code is organized by domain (routes/queues/chain/ai/auth/etc.). Add comments only when logic isn’t obvious.
- Config via Zod-validated env (`src/config.ts`); Prisma schema is the source of truth for data models.
- Scheduling/async work uses BullMQ + Redis; Redis also handles pub/sub (alerts) and caching (snapshots/predictions).
- Chain integration uses viem; contracts in `apps/chain` with Hardhat/TypeChain; tests cover permit flows/treasury/LP/staking/gov.
- AI service is isolated (`apps/ai`) with Python FastAPI + LightGBM and optional deep stubs; API calls it via HTTP.
- Security: helmet + rate limiting enabled; JWT + refresh + optional TOTP/OAuth; billing verifies token payments via transferFrom/txHash/permit.
- Tests: vitest (indicators), pytest (AI backtest), Hardhat (contracts); type checks for TS workspaces.
