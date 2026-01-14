# Crypto Tracker AI Service

FastAPI service for training, inference, backtesting, and optional deep models. The API gateway proxies these endpoints; the service can also be protected directly with `AI_AUTH_TOKEN`.

## Prerequisites
- Python 3.10
- Virtual environment (recommended): `python -m venv .venv` then `source .venv/bin/activate` (Linux/Mac) or `.venv\Scripts\activate` (Windows/PowerShell).

## Install deps
```sh
pip install -r requirements.txt
```

## Env
- Create `.env` in this folder if you need secrets:
  - `OPENAI_API_KEY=<key>` (for `/chat`)
  - `AI_AUTH_TOKEN=<token>` to require `Authorization: Bearer <token>` on all endpoints. If unset, endpoints are open (local/dev only).

## Run
```sh
# Dev server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
# Or via package script (Windows-friendly):
npm run dev --workspace apps/ai
```

## Test / typecheck (Python)
```sh
# From repo root
npm run test --workspace apps/ai       # creates venv, installs deps, runs pytest, compileall
npm run typecheck --workspace apps/ai  # same flow as test
```

## Endpoints (FastAPI)
- `GET /health`
- `POST /train` — body per `models.TrainRequest`; returns metrics, feature importances, artifacts.
- `POST /infer` — body per `models.AIInferenceRequest`; returns predictions.
- `POST /backtest` — body per `TrainRequest`; returns backtest metrics.
- `POST /train/deep` — experimental deep models; same shape as `/train`.
- The Fastify API exposes `/ai/train/from-db` to stream candles from Postgres and trigger `/train` for each market/timeframe; inference/scheduler run only for markets with artifacts present in `apps/ai/artifacts`.

Models, schemas: see `models.py`, `train.py`, `infer.py`, `backtest.py`.

## Artifacts
- Saved models live under `apps/ai/artifacts/*.pkl` with `*.meta.json` metadata. Clean up as needed for local runs; persist externally for prod if required.
