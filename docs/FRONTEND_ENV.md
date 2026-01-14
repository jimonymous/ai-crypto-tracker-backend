# Vite/Tailwind Environment Wiring

Guide for configuring the Vite frontend to talk to the API/WS and pass chain context. Complements `.env.example` in `apps/api`.

## Required Vite env vars
Add to `apps/web/.env.local` (do not commit):
```
VITE_API_BASE_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000
VITE_CHAIN_DEFAULT_ID=31337
VITE_CHAIN_DEFAULT_RPC=http://localhost:8545
```
Other common flags:
```
# optional feature flags / UX
VITE_FEATURE_DEX=true
VITE_FEATURE_REWARDS=true
```

## Dev proxy (recommended)
In `apps/web/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE_URL || "http://localhost:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, "")
      },
      "/ws": {
        target: process.env.VITE_WS_URL || "ws://localhost:4000",
        changeOrigin: true,
        ws: true
      }
    }
  }
});
```
Then call API as `/api/...` and WS as `new WebSocket("/ws/updates")` in dev; in prod, point env vars directly at the deployed API/WS.

## Environment matrix (frontend → backend)
- Local: `VITE_API_BASE_URL=http://localhost:4000`, `VITE_WS_URL=ws://localhost:4000`, `VITE_CHAIN_DEFAULT_ID=31337`, `VITE_CHAIN_DEFAULT_RPC=http://localhost:8545`
- Dev/Stage/Prod: set to the deployed API/WS URLs; align `VITE_CHAIN_DEFAULT_ID`/`RPC` with the chain used in `MULTICHAIN_JSON` or `CHAIN_ID`/`CHAIN_RPC_URL`.
- DEX/arb routes use live RPCs (ETH/Polygon/etc.); ensure backend `.env` RPCs are set and be mindful of provider rate limits when exercising `/dex/history`, `/dex/candles`, `/arb/*` from the UI.

## Runtime chain overrides
- Middleware should read `VITE_CHAIN_DEFAULT_ID`/`RPC` as fallback when MetaMask is absent.
- When a wallet is connected, prefer the wallet’s `chainId`; allow user-specified `rpcUrl` and pass through on requests that support it.

## Platform notes
- Use WSL2 or native Node for dev tasks; WSL1 is unsupported.
- Keep `.env.local` out of source control; use per-env secrets managers for prod.
