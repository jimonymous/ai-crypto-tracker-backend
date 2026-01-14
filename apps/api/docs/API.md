## REST API Cheat Sheet

Base URL (local): `http://localhost:4000`

### Health
- `GET /health` — liveness check, returns `{ status: "ok" }`.

### Docs / WebSockets
- `GET /docs` — Swagger UI
- `ws://localhost:4000/ws/updates` — send `{"type":"subscribe","symbol":"BTC/USDT","timeframe":"1h"}` to receive periodic snapshots

### Auth (JWT)
- `POST /auth/register` — body `{ email: string, password: string, walletAddress?: string }` → `{ token: string, refreshToken: string, user: { id: string, email: string, walletAddress: string | null } }`
- `POST /auth/login` — body `{ email: string, password: string }` → `{ token, refreshToken, user }`
- `POST /auth/oauth/google` — body `{ idToken: string }` → `{ token, refreshToken, user }`
- `POST /auth/refresh` — body `{ refreshToken: string }` → `{ token, refreshToken, user }`
- `POST /auth/totp/setup` / `POST /auth/totp/enable` — optional 2FA (JWT required)
- `GET /auth/me` — header `Authorization: Bearer <token>` → `{ id: string, email: string, walletAddress: string | null }`
Most protected routes (billing/premium/alerts/AI) require a JWT; AI routes also require an active access pass.

### Markets & Data
- `GET /markets` — list markets with `{ symbol: string, timeframe: string, lastClose: number, change24h: number, volume24h: number }`
- `GET /markets/stats` — `{ totalVolume24h: number, btcDominance?: number, trending: string[] }`
- `GET /snapshot?symbol=BTC/USDT&timeframe=1h` — returns the latest candles (from DB when present), computed indicators, and optional AI signal. Uses live RPC for DEX-backed markets. `symbol` is required.
- On-chain/DEX endpoints:
  - `GET /dex/spot?chainId=1&sellToken=0x...&buyToken=0x...` — on-chain spot price; returns `{ price, poolAddress, pathKind }`. Requires allowlisted tokens/pools.
  - `GET /dex/pool/reserves?chainId=1&poolAddress=0x...` — raw reserves and token addresses for an allowlisted pool.
  - `GET /dex/history?chainId=...&sellToken=...&buyToken=...&windowMinutes=...&intervalSeconds=...&minSamples=...` — builds an in-memory timeseries from recent swaps; no DB writes.
  - `GET /dex/routers?chainId=...` — allowlisted v2/v3/algebra router + quoter addresses; useful for client-side calldata assembly.

### Portfolio
- `GET /portfolio/holdings?wallet=0x...` — mock portfolio aggregation (off-chain), returns holdings and totals.
- `POST /portfolio/holdings` — upsert a holding for demo/testing; body `{ wallet, assetSymbol, quantity, averageCost? }`.

### Wallet balances (on-chain)
- `GET /wallet/balances?address=0x...&chainId=...&rpcUrl=...` — reads native + allowlisted ERC20 balances via viem; `rpcUrl` (http/https) can override the configured chain RPC.

### DEX / Quotes / Arb
- `GET /dex/quote?chainId=...&sellToken=0x...&buyToken=0x...&amount=` — price + source; uses 0x where possible or direct pool math.
- `GET /dex/pools?chainId=...` — allowlisted pools and tokens for the chain; generated from discovery.
- `GET /dex/depth?chainId=...&poolAddress=0x...` — on-chain spot + reserves snapshot for a single pool.
- `GET /arb/opportunities?chainId=...&sellToken=...&buyToken=...&amount=` — best-price vs buy price arb; includes multicall when applicable.
- `GET /dex/candles` — on-the-fly OHLC built from on-chain samples; params: `chainId`, `poolAddress` or `sellToken`/`buyToken`, `windowMinutes`, `intervalSeconds`, `maxBlocks`, `minSamples`. No DB writes.
- `GET /arb/cycles` — cycle finder across v2/v3/algebra; params: `chainIds[]`, `tokens[]` or `bases[]`, `amount`, `minProfitPct/Abs`, `slippageBps`. Returns legs, shelf life, bankroll guidance, unsigned multicall.
- `GET /arb/history` — block-walking history of cycles; same filters as `/arb/cycles` plus `windowMinutes`, `intervalSeconds`.
- `POST /dex/ingest/allowlist` — schedules DB candle builds for allowlisted pools; rate-limited via `rateLimitPerSec`; can target one chain via `chainId`.

### Alerts / Real-time
- `GET /alerts`, `POST /alerts`, `DELETE /alerts/:id` — price_above/price_below alerts (JWT required)
- WebSocket `/ws/updates` — send `{"type":"subscribe","symbol":"BTC/USDT","timeframe":"1h"}` for snapshots; receives `{type:"alert"}` push on triggers

- ### AI / Chat / Training
- `POST /ai/chat` — body `{ message?, symbol?, timeframe?, horizonMinutes?, chainId?, rpcUrl?, modelVersion? }` → fetches latest candles/indicators and calls the AI inference service; returns summary plus full AI payload. Requires JWT and wallet with an active access pass (see `/billing/price` + `/billing/purchase`). Defaults to `WBTC/USDT` + `1h` when symbol/timeframe are omitted. Live inference runs only when local `v1_*.pkl` artifacts exist; otherwise the latest cached prediction is returned. `chainId`/`rpcUrl` (http/https) let you align with the user’s selected network; env defaults are used otherwise.
- `POST /ai/infer` — proxy to AI service `/infer`; body `{ symbol, timeframe, horizonMinutes, candles, indicators?, requestId?, asOf?, chainId?, rpcUrl?, modelVersion? }`. JWT + active access pass required; supports chainId/rpcUrl query/body for multi-chain alignment. `modelVersion` forces a specific artifact set; omitted defaults to the highest common version resolved by the AI service.
- `POST /ai/train` — proxy to AI service `/train`; body `{ symbol, timeframe, horizonMinutes, candles, indicators?, test_size?, requestId?, chainId?, rpcUrl? }`. JWT + active access pass required; supports chainId/rpcUrl.
- `POST /ai/train/from-db` — trains from stored candles/indicators; body `{ marketId?: string, all?: boolean, timeframe?, horizonMinutes, limit?, symbol? }`. Use this after ingestion to generate artifacts under `apps/ai/artifacts`; inference/scheduler run only for markets with artifacts present. Returns per-market train results and artifact paths.
- `POST /ai/train/deep` — trains deep models; same body as `/ai/train`. JWT + active access pass required; supports chainId/rpcUrl.
- `POST /ai/backtest` — proxy to AI `/backtest`; body `{ symbol, timeframe, horizonMinutes, candles, indicators?, requestId?, chainId?, rpcUrl? }`. JWT + active access pass required; supports chainId/rpcUrl.
- `POST /train/deep` (AI service) — trains LSTM/Transformer models (optional, experimental)
- `POST /backtest` (AI service) — basic return/drawdown/vol/sharpe backtest

### Premium gating
- `GET /premium/status?address=0x...&chainId=...&rpcUrl=...` — `{ eligible: boolean, reason?: string }`

### Staking & Governance
- Addresses are pulled from `apps/chain/deployments/<network>.json` (set `CHAIN_DEPLOYMENT` or `CHAIN_ID` to pick the file). API integration tests expect you to run a Hardhat node separately (`cd apps/chain && npx hardhat node --hostname 127.0.0.1 --port 8545`) and reuse the existing deployment JSON.
- `GET /staking/:address` — reads staked balance/total for the configured staking contract.
- `POST /staking/stake|unstake` — server wallet signs tx (requires `CHAIN_PRIVATE_KEY`).
- `GET /governance/proposals` — reads proposals from GovernanceStub.
- `POST /governance/create|vote` — requires `Authorization: Bearer <jwt>`; server wallet submits the tx.

### Rewards
- `GET /rewards/epoch/latest` — `{ epoch: number, root: string, total: string, chainId: number }`
- `GET /rewards/proof?address=0x...&epoch=<optional>&chainId=...&rpcUrl=...` — `{ amount: string, proof: string[], claimed: boolean, chainId: number }`
- `GET /rewards/history?address=0x...` — `{ accruals: { epoch: number, amount: string, txHash?: string }[] }`

### Billing / Token Spend
- `GET /billing/price?chainId=...&rpcUrl=...` — `{ amount: string, decimals: number, tokenAddress: string, periodMinutes: number }`
- `POST /billing/purchase` — JWT required; optional query/body `chainId`/`rpcUrl`; optional body `{ txHash?: string, permit?: { deadline: number, v: number, r: string, s: string } }`; response `{ accessPass: { expiresAt: string, chainId: number } }`
AI endpoints (currently `/ai/chat`) require a JWT and the user’s wallet to have an active access pass; balance is checked and pass issued on `/billing/purchase`.

### Compliance
- `POST /compliance/kyc/start` — starts stub flow; returns `{ verificationId: string, status: "pending" }`
- `GET /compliance/kyc/status?verificationId=...` — `{ status: "pending" | "verified" | "failed" }`
- `POST /compliance/kyc/verify` — body `{ verificationId: string, status: "verified" | "failed" }`

### Notes for frontend wiring
- Auth: store JWT and send as `Authorization: Bearer <token>` for protected calls (currently only `/auth/me`; extend as needed).
- Snapshot data includes candles + indicator series + prediction; ready for charts/overlays.
- Wallet balances uses viem to read ERC20; configure `WALLET_TOKEN_LIST=0xToken:symbol:decimals,...` for more assets.
- Rewards publish/claim requires chain deployment addresses + `CHAIN_PRIVATE_KEY` for on-chain merkle root updates.

### Tests & integration expectations
- Run API suite: `npm run test --workspace apps/api`.
- On-chain integration tests reuse a running Hardhat node and deployments from `apps/chain/deployments`; start it separately: `cd apps/chain && npx hardhat node --hostname 127.0.0.1 --port 8545`.
- Live-RPC tests (DEX/arb/poolHistory) call mainnet/Polygon/etc.; fill real RPC URLs in `.env` (see `apps/api/docs/ENV.md`) and mind provider rate limits. You can rerun a single file with `npm run test --workspace apps/api -- src/routes/dex.candles.integration.test.ts`.
- AI proxy tests require the AI service running (`npm run dev --workspace apps/ai`) and artifacts in `apps/ai/artifacts` (train via `/ai/train/from-db` first).
