# Frontend Testing Examples (Vite + React + Tailwind)

These examples are intended as references for frontend engineers wiring the Vite/Tailwind app. They are not wired into the current `apps/web` package yet; copy the snippets into your components and tests when the web codebase lands.

## Setup (recommended)
- Add dev deps: `npm i -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`
- In `apps/web/vite.config.ts`, add:
  ```ts
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true
  }
  ```
- `src/test/setup.ts`:
  ```ts
  import "@testing-library/jest-dom";
  ```

## Component test (badge + CTA)
```tsx
// src/components/MarketBadge.tsx
type Props = { label: string; value: string; tone?: "green" | "red" | "neutral"; onClick?: () => void };
const tones = {
  green: "bg-emerald-500/10 text-emerald-300 border-emerald-600/60",
  red: "bg-rose-500/10 text-rose-300 border-rose-600/60",
  neutral: "bg-slate-500/10 text-slate-200 border-slate-600/60"
};
export function MarketBadge({ label, value, tone = "neutral", onClick }: Props) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-medium ${tones[tone]}`}
      onClick={onClick}
      aria-label={`${label} ${value}`}
    >
      <span className="uppercase text-xs tracking-wide text-slate-400">{label}</span>
      <span className="tabular-nums">{value}</span>
    </button>
  );
}
```

```tsx
// src/components/MarketBadge.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarketBadge } from "./MarketBadge";

it("renders label/value and calls onClick", async () => {
  const click = vi.fn();
  render(<MarketBadge label="Change" value="+2.4%" tone="green" onClick={click} />);
  expect(screen.getByText("+2.4%")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /change/i }));
  expect(click).toHaveBeenCalled();
});
```

## Hook test (formatting + trend)
```tsx
// src/hooks/useTrend.ts
export const useTrend = (values: number[]) => {
  if (!values.length) return { delta: 0, direction: "flat" as const };
  const delta = values[values.length - 1] - values[0];
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { delta, direction };
};
```

```tsx
// src/hooks/useTrend.test.ts
import { useTrend } from "./useTrend";

it("detects up/down/flat", () => {
  expect(useTrend([1, 2, 3]).direction).toBe("up");
  expect(useTrend([3, 2, 1]).direction).toBe("down");
  expect(useTrend([1, 1, 1]).direction).toBe("flat");
});
```

## Page test (snapshot API wiring)
```tsx
// src/pages/Dashboard.tsx
import { useEffect, useState } from "react";
type Snapshot = { symbol: string; lastClose: number | null };
export function Dashboard() {
  const [data, setData] = useState<Snapshot | null>(null);
  useEffect(() => {
    fetch("/api/snapshot?symbol=BTC/USDT&timeframe=1h")
      .then((r) => r.json())
      .then((json) => setData({ symbol: json.symbol, lastClose: json.candles.at(-1)?.close ?? null }))
      .catch(() => setData(null));
  }, []);
  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
      {data ? (
        <p data-testid="last-close">Last close {data.symbol}: {data.lastClose}</p>
      ) : (
        <p data-testid="loading">Loading...</p>
      )}
    </div>
  );
}
```

```tsx
// src/pages/Dashboard.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { Dashboard } from "./Dashboard";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ symbol: "BTC/USDT", candles: [{ close: 50000 }] })
    } as any)
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("renders last close from snapshot API", async () => {
  render(<Dashboard />);
  await waitFor(() => expect(screen.getByTestId("last-close")).toBeInTheDocument());
  expect(screen.getByText(/BTC\/USDT/)).toBeInTheDocument();
});
```

## Styling checks (Tailwind classes)
- Use `toHaveClass` for key utility classes:
  ```tsx
  expect(screen.getByRole("button")).toHaveClass("rounded-md");
  ```
- Prefer behavior assertions over class snapshots; only assert classes that matter (layout, spacing, state colors).

## MSW (optional) for API mocks
- Add dev deps: `npm i -D msw`
- Example handler:
  ```ts
  import { http, HttpResponse } from "msw";
  export const handlers = [
    http.get("/api/snapshot", () => HttpResponse.json({ symbol: "BTC/USDT", candles: [{ close: 12345 }] }))
  ];
  ```
- Start MSW in `setup.ts` during tests if you need more realistic mocks.
