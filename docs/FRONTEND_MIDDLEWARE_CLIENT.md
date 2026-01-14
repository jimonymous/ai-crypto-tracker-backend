# Typed Client Cookbook (middleware layer)

Blueprint for a Vite/Tailwind-friendly client that wraps the API with typed calls, auth injection, chain context, retries, caching, and WebSocket lifecycle.

## Design goals
- Single entrypoint: `createClient({ baseUrl, getToken, onAuthError, getChainContext })`. Pair with `createWsClient` for sockets.
- Typed methods per route group (auth, billing/premium, rewards, markets/snapshot, indicators, ai, wallet, dex, arb, compliance).
- Error normalization with small taxonomy (AuthError, AccessPassError, RateLimitError, TransientError, etc.).
- Opt-in retries for transient/network failures; timeouts per call.
- WebSocket manager with heartbeat + resubscribe.

## Chain context helper
```ts
export type ChainContext = { chainId?: number; rpcUrl?: string };

export async function getChainContext(): Promise<ChainContext> {
  if (!window.ethereum) return {};
  const provider = new (await import("ethers")).BrowserProvider(window.ethereum as any);
  const net = await provider.getNetwork();
  return { chainId: Number(net.chainId) };
}
```

## Error helpers
```ts
class ApiError extends Error { constructor(message: string, public status?: number, public code?: string) { super(message); } }
class AuthError extends ApiError {}
class AccessPassError extends ApiError {}
class RateLimitError extends ApiError { retryAfter?: number; }
class TransientError extends ApiError {}

function normalizeError(status: number, body: any): ApiError {
  const message = body?.message || body?.error || `HTTP ${status}`;
  const code = body?.code;
  if (status === 401 || status === 403) return new AuthError(message, status, code);
  if (status === 402) return new AccessPassError(message, status, code);
  if (status === 429) {
    const err = new RateLimitError(message, status, code);
    const ra = Number(body?.retryAfter) || undefined;
    err.retryAfter = Number.isFinite(ra) ? ra : undefined;
    return err;
  }
  if (status >= 500 || status === 0) return new TransientError(message, status, code);
  return new ApiError(message, status, code);
}
```

## Fetch wrapper (JWT + chain + timeout + retry)
```ts
type ClientDeps = {
  baseUrl: string;
  getToken: () => Promise<string | null> | string | null;
  getChainContext?: () => Promise<ChainContext> | ChainContext;
  onAuthError?: () => void;
  defaultTimeoutMs?: number;
};

async function request<T>(path: string, init: RequestInit = {}, deps: ClientDeps, opts?: { retries?: number }) {
  const { baseUrl, getToken, getChainContext, onAuthError, defaultTimeoutMs = 12000 } = deps;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), defaultTimeoutMs);
  const token = await Promise.resolve(getToken());
  const chain = (await Promise.resolve(getChainContext?.())) || {};
  const headers = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  const url = new URL(path, baseUrl);
  // attach chain context to query when provided
  if (chain.chainId) url.searchParams.set("chainId", String(chain.chainId));
  if (chain.rpcUrl) url.searchParams.set("rpcUrl", chain.rpcUrl);
  try {
    const res = await fetch(url.toString(), { ...init, headers, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = normalizeError(res.status, body);
      if (err instanceof AuthError && onAuthError) onAuthError();
      throw err;
    }
    return body as T;
  } catch (err: any) {
    if (opts?.retries && opts.retries > 0 && (err instanceof TransientError || err.name === "AbortError")) {
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, (opts.retries ?? 1) - 1)));
      return request<T>(path, init, deps, { retries: (opts.retries ?? 1) - 1 });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
```

## Client shape (examples)
```ts
export function createClient(deps: ClientDeps) {
  return {
    auth: {
      login: (body: any) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }, deps),
      refresh: (body: any) => request("/auth/refresh", { method: "POST", body: JSON.stringify(body) }, deps)
    },
    billing: {
      price: () => request("/billing/price", {}, deps),
      purchase: (body: any) => request("/billing/purchase", { method: "POST", body: JSON.stringify(body) }, deps)
    },
    premium: {
      status: (address: string) => request(`/premium/status?address=${address}`, {}, deps)
    },
    ai: {
      chat: (body: any) => request("/ai/chat", { method: "POST", body: JSON.stringify(body) }, deps, { retries: 1 })
    },
    indicators: {
      rating: (symbol: string, timeframe = "1h") =>
        request(`/indicators/rating?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`, {}, deps)
    },
    markets: {
      snapshot: (symbol: string, timeframe = "1h") => request(`/snapshot?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`, {}, deps),
      markets: () => request("/markets", {}, deps),
      stats: () => request("/markets/stats", {}, deps)
    },
    wallet: {
      balances: (address: string) => request(`/wallet/balances?address=${address}`, {}, deps)
    },
    rewards: {
      proof: (address: string, epoch?: string | number) =>
        request(`/rewards/proof?address=${address}${epoch ? `&epoch=${epoch}` : ""}`, {}, deps)
    },
    dex: {
      spot: (params: URLSearchParams) => request(`/dex/spot?${params.toString()}`, {}, deps),
      poolReserves: (params: URLSearchParams) => request(`/dex/pool/reserves?${params.toString()}`, {}, deps)
    },
    arb: {
      cycles: (params: URLSearchParams) => request(`/arb/cycles?${params.toString()}`, {}, deps)
    }
  };
}
```

## WebSocket manager (snapshots + alerts)
```ts
type WsDeps = { wsUrl: string; onMessage: (msg: any) => void; onStatus?: (s: "open"|"closed"|"reconnecting") => void };

export function createWsClient({ wsUrl, onMessage, onStatus }: WsDeps) {
  let ws: WebSocket | null = null;
  let retries = 0;
  const heartbeatMs = 15000;
  let heartbeat: any;

  const connect = () => {
    onStatus?.("reconnecting");
    ws = new WebSocket(wsUrl);
    ws.onopen = () => { retries = 0; onStatus?.("open"); heartbeat = setInterval(() => ws?.send?.(JSON.stringify({ type: "ping" })), heartbeatMs); };
    ws.onmessage = (evt) => onMessage(JSON.parse(evt.data));
    ws.onclose = () => {
      onStatus?.("closed");
      clearInterval(heartbeat);
      const delay = Math.min(1000 * Math.pow(2, retries++), 15000);
      setTimeout(connect, delay);
    };
    ws.onerror = () => ws?.close();
  };

  connect();

  return {
    send: (data: any) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(data)),
    close: () => { clearInterval(heartbeat); ws?.close(); }
  };
}
```

## Caching guidance
- Snapshot/markets: cache in memory (SWR pattern) with short TTL (15–60s); invalidate on symbol/timeframe change.
- Auth: store JWT in memory when possible; if persisted, prefix localStorage keys per env.
- DEX spot/reserves/arb cycles: avoid caching; use short TTLs if needed (quotes expire quickly; shelf life is returned).
- Rewards proof: cache per `address+chainId+epoch` until data changes.

## Testing the client
- Use MSW to stub routes; assert error classes for specific status codes.
- Simulate 5xx to verify retries/backoff; simulate AbortError to ensure timeout handling.
- WebSocket tests: fake server or mock WebSocket to assert reconnect + resubscribe behavior.
