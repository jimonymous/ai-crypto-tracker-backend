# Frontend wiring (MetaMask chainId/rpcUrl passthrough)

Use the user’s selected MetaMask network to drive chain-aware backend calls. Always fall back to env RPC when not provided.

## Get chain info from MetaMask
```ts
import { ethers } from "ethers";

export async function getChainContext() {
  if (!window.ethereum) throw new Error("Wallet not connected");
  const provider = new ethers.BrowserProvider(window.ethereum as any);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  // Optional: let user enter a custom RPC; otherwise omit to use backend env RPC
  return { chainId };
}
```

## Billing purchase with chainId
```ts
const { chainId } = await getChainContext();
await fetch(`/billing/purchase?chainId=${chainId}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ /* optionally txHash or permit */ })
});
```

### Billing via txHash (user transfer)
```ts
const { chainId } = await getChainContext();
const txHash = await sendPaymentTx(); // user signs a transfer to treasury
await fetch(`/billing/purchase?chainId=${chainId}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ txHash })
});
```

### Billing via permit (no separate transfer)
```ts
const { chainId } = await getChainContext();
const permit = await signPermit({ tokenAddress, treasuryAddress, amount, chainId }); // EIP-2612
await fetch(`/billing/purchase?chainId=${chainId}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ permit })
});
```

## Premium status (wallet + chain)
```ts
const { chainId } = await getChainContext();
const res = await fetch(`/premium/status?address=${walletAddress}&chainId=${chainId}`);
const status = await res.json();
```

## AI chat with chainId/rpcUrl
```ts
const { chainId } = await getChainContext();
const chatRes = await fetch("/ai/chat", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    message: "Outlook?",
    symbol: "BTC/USDT",
    timeframe: "1h",
    chainId,         // rpcUrl optional; backend falls back to env RPC
    horizonMinutes: 60
  })
});
const chatData = await chatRes.json();
```

## Rewards proof fetch
```ts
const { chainId } = await getChainContext();
const res = await fetch(`/rewards/proof?address=${walletAddress}&chainId=${chainId}`);
const proof = await res.json(); // { amount, proof, epoch, status }
```

## DEX quote (allowlisted pools)
```ts
// spot price direct from allowlisted v2/v3 pools
const params = new URLSearchParams({ chainId: String(chainId), sellToken, buyToken, amount: "1000000000000000000" });
const res = await fetch(`/dex/spot?${params.toString()}`);
const spot = await res.json(); // { price, source: "onchain", fetchedAt, ttlSeconds }

// optional: pool reserves for UI depth display (v2 pairs)
const reserves = await fetch(`/dex/pool/reserves?chainId=${chainId}&poolAddress=${poolAddr}`).then((r) => r.json());
```

## Arb cycles (unsigned calldata)
```ts
const params = new URLSearchParams({
  chainId: String(chainId),
  bases: ["USDC","WETH"].join(","),
  minProfitPct: "0.01",
  slippageBps: "30"
});
const res = await fetch(`/arb/cycles?${params.toString()}`);
const { opportunities } = await res.json(); // includes profitPct, shelfLifeMs, bankroll guidance, calldata/multicall legs
```

## Indicator rating (composite score)
```ts
const rating = await fetch(`/indicators/rating?symbol=ETH/USDT&timeframe=1h&enabled=rsi,macd,ema50&weights[rsi]=2`).then((r) => r.json());
// rating.score (0-100), bias (-1..1), values keyed by indicator
```

## Wallet balances (chain-aware)
```ts
const { chainId } = await getChainContext();
const res = await fetch(`/wallet/balances?address=${walletAddress}&chainId=${chainId}`);
const { balances } = await res.json();
```

## Tailwind UI states (status-forward UX)
```tsx
function StatusBadge({ state }: { state: "idle" | "loading" | "error" | "ok" }) {
  const tone = {
    idle: "bg-slate-700/50 text-slate-200 border-slate-500/60",
    loading: "bg-amber-500/10 text-amber-200 border-amber-500/60 animate-pulse",
    error: "bg-rose-500/10 text-rose-200 border-rose-600/60",
    ok: "bg-emerald-500/10 text-emerald-200 border-emerald-500/60"
  }[state];
  return (
    <span className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-semibold ${tone}`}>
      {state === "loading" && <span className="h-2 w-2 animate-ping rounded-full bg-current" />}
      {state.toUpperCase()}
    </span>
  );
}
```
