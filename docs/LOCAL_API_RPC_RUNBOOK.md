# Local API / AI / RPC Runbook

How to bring up the stack, call the services, and run tests against local Hardhat + live mainnet/polygon RPCs.

## Prereqs
- Docker Desktop running (Postgres/Redis via `docker compose`).
- Node.js + npm available in WSL (API).
- Python + uvicorn available in Bash/Powershell for the AI service.
- ENV: copy `apps/api/.env.example` to `.env` and set real RPCs/keys. Keep `CHAIN_RPC_URL=http://localhost:8545` for local Hardhat; DEX endpoints use live mainnet/polygon RPCs. Full variable guidance: `apps/api/docs/ENV.md`.

## Start services
```bash
# 1) Datastores
docker compose up -d

# 2) Local chain with deployed contracts (Hardhat)
cd apps/chain
npm run dev         # starts hardhat node on 127.0.0.1:8545 and deploys scripts/deploy.ts

# 3) API (WSL)
cd /mnt/c/Users/james/OneDrive/Desktop/AI Crypto\ Tracker
npm run dev         # starts Fastify API on http://0.0.0.0:4000

# 4) AI service (separate shell; use your venv)
cd apps/ai
source .venv/bin/activate   # or your venv activate script
npm run dev                 # uvicorn main:app --reload --port 8000

# 5) Train AI once candles exist (artifacts gate inference/scheduler)
curl -X POST http://0.0.0.0:4000/ai/train/from-db \
  -H "Authorization: Bearer <your JWT>" \
  -H "Content-Type: application/json" \
  -d '{"all": true, "horizonMinutes": 60, "limit": 600}'
```
Artifacts land in `apps/ai/artifacts`; inference and AI scheduler run only for markets with artifacts present.
```

## Quick API calls (WSL curl)
```bash
# Health
curl http://localhost:4000/health

# Snapshot (uses DB indicators + cached data)
curl "http://localhost:4000/snapshot?symbol=BTC/USDT&timeframe=1h"

# DEX spot from live mainnet pools (no local RPC): USDC/WETH v3 0.05%
curl "http://localhost:4000/dex/spot?chainId=1&sellToken=USDC&buyToken=WETH&amount=1000000"

# DEX pool reserves (v2-style) from live mainnet pool
curl "http://localhost:4000/dex/pool/reserves?chainId=1&poolAddress=0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640"

# Arb cycles (live mainnet spot, no local DEX RPC): USDC/WETH/DAI
curl "http://localhost:4000/arb/cycles?chainIds=1&tokens=USDC,WETH,DAI&bases=USDC&amount=1000000&minProfitPct=0&minProfitAbs=0&slippageBps=30"

# Indicator rating (composite score)
curl "http://localhost:4000/indicators/rating?symbol=ETH/USDT&timeframe=1h&enabled=rsi,macd,ema50&weights[rsi]=2"

# AI chat (requires API + AI running, JWT, and an active access pass)
curl -X POST http://localhost:4000/ai/chat \
  -H "Authorization: Bearer <your JWT>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Outlook?","symbol":"BTC/USDT","timeframe":"1h"}'
```

## Chain RPC usage
- Local Hardhat (contracts): `http://localhost:8545` from `apps/chain dev`. Contracts deployed via `scripts/deploy.ts` to this node.
- Live DEX reads: `ETH_MAINNET_RPC`, `POLYGON_MAINNET_RPC`, etc., from `.env` are used for `/dex/*`, `/arb/cycles`, and wallet live balance tests; no local DEX RPCs are expected.

## Tests (WSL)
```bash
# Full API suite (local Hardhat + live RPC reads)
cd apps/api
npm run test

# Targeted live RPC checks
npm run test --filter "dex live"
npm run test --filter "arb live"
npm run test --filter "wallet live"

# Chain contracts (local hardhat)
cd ../chain
npm run test        # spins up hardhat, deploys, runs contract tests

# Web smoke (API/AI + live DEX/arb)
cd ../web
npm test            # hits API/AI health, live dex spot, and arb cycles (assumes API on 0.0.0.0:4000, AI on 0.0.0.0:8000)
# Additional historical endpoints (live on-chain)
# - /dex/history?chainId=1&sellToken=USDC&buyToken=WETH&windowMinutes=15&intervalSeconds=30&minSamples=3
# - /arb/history?chainId=1&tokens=USDC,WETH,DAI&windowMinutes=15&intervalSeconds=30&minProfitPct=0.001
# - /dex/routers?chainId=1 (allowlisted v2/v3/CL router/quoter addresses)
# - /dex/candles?chainId=1&sellToken=USDC&buyToken=WETH&windowMinutes=15&intervalSeconds=30&minSamples=3 (on-the-fly OHLC built from on-chain spots)
```

Notes:
- Keep Hardhat node running while API tests execute.
- Live DEX/arb tests rely on mainnet RPCs and may hit rate limits if env RPCs are slow; they skip gracefully if unavailable.
- No local DEX RPCs are used; only the contract tests use the local Hardhat node.
- AI chat/infer/backtest will return 404/skip if artifacts are missing; train via `/ai/train/from-db` after ingesting candles. Chat runs live inference only when local `v1_*.pkl` artifacts exist; otherwise it falls back to the latest cached prediction. Tests mock data and won’t populate your dev DB—seed markets, let scheduler ingest for WBTC/USDT, then call `/ai/train/from-db?symbol=WBTC/USDT&timeframe=1h` to write artifacts.
