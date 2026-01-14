# Frontend Middleware Guide (Vite + Tailwind consumers)

Authoritative guide for teams building a thin middleware/client layer that connects the AI Crypto Tracker API to a Vite + Tailwind frontend. Assumes the backend (Fastify API + AI service + Hardhat contracts) is running per the root README.

## Scope & ownership
- **Middleware**: typed API client, auth/token handling, chain context injection (`chainId`/`rpcUrl`), error normalization, retries/backoff, WebSocket lifecycle, caching.
- **Backend**: business logic, billing/premium/rewards, chain calls, data/AI ingestion, rate limits, security controls.
- **Frontend (Vite/Tailwind)**: UI state, routing, rendering, MetaMask connection UX, surfacing errors and statuses from middleware.

## Environments (align with `.env.example` and Vite env)
| Env | API base | WS base | Chain defaults | Notes |
| --- | --- | --- | --- | --- |
| local | `http://localhost:4000` | `ws://localhost:4000` | `CHAIN_ID=31337`, `CHAIN_RPC_URL=http://localhost:8545` | run via `npm run dev` + `docker compose up -d` |
| dev | e.g., `https://dev-api.example.com` | `wss://dev-api.example.com` | set `CHAIN_ID`/`MULTICHAIN_JSON` to dev/testnet | tighten CORS to dev web origin |
| stage | e.g., `https://stg-api.example.com` | `wss://stg-api.example.com` | stage RPC + contracts | mirrors prod data shape |
| prod | `https://api.example.com` | `wss://api.example.com` | mainnet RPC/contracts | strict CORS, HSTS/Helmet |

Frontend Vite vars (documented in `docs/FRONTEND_ENV.md`): `VITE_API_BASE_URL`, `VITE_WS_URL`, `VITE_CHAIN_DEFAULT_ID`, `VITE_CHAIN_DEFAULT_RPC`.

## Core flows (text sequences)
- **Auth + session**
  1. `POST /auth/login|register|oauth/google` → `{ token, refreshToken }`
  2. Store JWT in memory (or httpOnly cookie if you front with BFF); refresh when 401 if refresh flow is available.
  3. Use `Authorization: Bearer <token>` for protected endpoints.
- **Billing / access pass**
  1. Ensure wallet connected; fetch `GET /billing/price?chainId=...`.
  2. Execute payment: `POST /billing/purchase` with optional `txHash` (user-sent transfer) or `permit` or allow server auto-charge if allowance exists.
  3. On 402, prompt user to pay; on 429, back off via `Retry-After`.
- **AI chat/infer/train**
  1. Require JWT + active access pass.
  2. Call `/ai/chat|infer|train|backtest` with `chainId` (and optional `rpcUrl`); middleware injects chain context.
  3. Handle latency: show loading; retry transient 5xx with jitter.
- **Snapshot + real-time**
  1. Fetch `/snapshot` for initial render.
  2. Connect WS `/ws/updates`; subscribe `{type:"subscribe",symbol,timeframe}`.
  3. Reconnect with backoff; re-send subscription on reconnect.
- **Indicators + rating**
  1. Call `/indicators/rating?symbol=&timeframe=` with optional `enabled`/`weights` to get per-indicator values and composite buy/sell score.
  2. Use the score alongside snapshots/AI responses; allow users to toggle indicators client-side.
- **DEX + arb (read-only)**
  1. Fetch `/dex/spot` or `/dex/pool/reserves` for on-chain prices/reserves on allowlisted v2/v3 pools.
  2. Use `/dex/history` or `/dex/candles` for transient OHLC (no DB writes) to power charts; pass `windowMinutes/intervalSeconds/minSamples`.
  3. Query `/arb/cycles` (and `/arb/history`) with bases/minProfit/slippage to surface profitable cycles, shelf life, bankroll guidance, and unsigned multicall for the user to sign.
- **Premium status**
  1. `GET /premium/status?address=&chainId=`; if not eligible, direct to billing or NFT requirement UI.
- **Rewards proof**
  1. `GET /rewards/proof?address=&chainId=` to fetch claim data; display proof/amount; signing/claim is on the user’s wallet if exposed in frontend.

## Chain handling (wallet-aware)
- Read `chainId` from MetaMask; optionally collect a user-specified `rpcUrl`.
- Always allow env fallback if `rpcUrl` omitted.
- For chain-specific endpoints (`wallet/balances`, `premium/status`, `billing/*`, `ai/*`, `rewards/*`, `dex/*`), pass `chainId` (+ `rpcUrl` when the user picked a custom RPC).
- If chain mismatch (user wallet vs configured env), surface a “switch network” prompt; middleware should refuse write flows until alignment.

## Error model & resilience (recommendations)
- Map HTTP to typed errors in middleware:
  - 401/403 → `AuthError`
  - 402 → `AccessPassError` (prompt purchase)
  - 404 → `NotFoundError` (bad symbol/epoch)
  - 409 → `ConflictError` (duplicate alert, etc.)
  - 429 → `RateLimitError` (respect `Retry-After`)
  - 5xx/ETIMEDOUT/ECONNRESET → `TransientError` (retry with exponential backoff: e.g., 3 attempts, 200/500/1200ms jitter)
- Normalize error payloads: expect `{ message, code? }`; fallback to status text when absent.
- Timeouts: set per-call fetch timeout (e.g., 10–15s) and surface UI state.

## Security & compliance
- CORS: API should allow only trusted web origins per env; middleware must send `Authorization` header only to the API origin.
- Auth storage: prefer in-memory + refresh flow; if using localStorage, guard against XSS; cookie mode requires SameSite/secure flags via a BFF.
- PII: KYC endpoints are stubs; do not log PII client-side. Avoid persisting JWT/PII in logs or analytics.
- Rate limits: default 1000/60s; handle 429 with user-friendly messaging and retry-after.
- AI service: protect with `AI_AUTH_TOKEN` if called directly; ideally route via API only.

## Observability & support
- Include `X-Request-ID` if provided; log it on the client when reporting issues.
- Surface key metrics in UI: loading/empty/error, rate-limit hits, chain mismatch, access status.
- Capture WS disconnect/reconnect events for debugging.

## Testing expectations (middleware/front-end)
- Unit: typed client methods (mock fetch/MSW) for auth, billing, premium, snapshot, AI.
- Integration: WebSocket reconnect + resubscribe behavior; chain context injection.
- UI: Vite + Testing Library per `docs/FRONTEND_TESTS.md`; mock network with MSW.

## Deliverables for teams
- Implement the typed client described in `docs/FRONTEND_MIDDLEWARE_CLIENT.md`.
- Adopt the env naming in `docs/FRONTEND_ENV.md`.
- Use the flow snippets in `docs/FRONTEND_SNIPPETS.md` as drop-in UI wiring for Vite + Tailwind.
- Quick REST smoke examples: `apps/api/scripts/smoke.http` (replace JWT/placeholders).

## Flow snippets (text diagrams)
- **Login → Billing → AI chat**
  - User submits creds → `/auth/login` → store JWT → `/billing/price` → wallet tx or permit → `/billing/purchase` (expect 200 or 402) → `/ai/chat` with JWT + chain context.
- **Connect wallet → Premium check → Snapshot + WS**
  - Wallet connect → read `chainId` → `/premium/status?address=&chainId=` → `/snapshot?symbol=&timeframe=` → open WS `/ws/updates` → send subscribe → handle `snapshot`/`alert` messages; on reconnect re-send subscribe.
- **Rewards proof**
  - Wallet connect → `/rewards/proof?address=&chainId=` → display proof/amount → (optional) user signs/claims on-chain in UI.
- Cross-links: API surface/details live in `docs/API.md`; chain deployment expectations in `docs/CHAIN_DEPLOY.md`; UI-ready snippets in `docs/FRONTEND_SNIPPETS.md`.
