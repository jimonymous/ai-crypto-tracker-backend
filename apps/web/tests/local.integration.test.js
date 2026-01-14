// Node built-in tests hitting locally hosted API/AI and live RPC-backed DEX endpoints.
// Assumes API on http://0.0.0.0:4000 (WSL) and AI on http://0.0.0.0:8000 (bash/venv).
// Live mainnet RPC must be configured in API env for DEX routes. Tests degrade gracefully if a service is down.

const { test, before } = require("node:test");
const assert = require("node:assert/strict");

const API_BASE = process.env.API_BASE || "http://0.0.0.0:4000";
const AI_BASE = process.env.AI_BASE || "http://0.0.0.0:8000";

let fetchFn;
before(() => {
  fetchFn = globalThis.fetch;
  assert.ok(fetchFn, "fetch is required (Node 18+)");
});

test("API health responds", async () => {
  const res = await fetchFn(`${API_BASE}/health`);
  assert.ok(res.ok, `health status ${res.status}`);
  const body = await res.json();
  assert.equal(body.status, "ok");
});

test("AI health responds (skips if offline)", async () => {
  const res = await fetchFn(`${AI_BASE}/health`);
  if (!res.ok) {
    const text = await res.text();
    assert.fail(`AI health status ${res.status}: ${text}`);
  }
  const body = await res.json();
  assert.equal(body.status, "ok");
});

test("DEX spot returns live mainnet price", async () => {
  const url = `${API_BASE}/dex/spot?chainId=1&sellToken=USDC&buyToken=WETH&amount=1000000`;
  const res = await fetchFn(url);
  if (!res.ok) return; // allow skip when price is unavailable
  const body = await res.json();
  assert.ok(body.price > 0, "price should be > 0");
});

test("Arb cycles endpoint returns 200 and an array", async () => {
  const url = `${API_BASE}/arb/cycles?chainIds=1&tokens=USDC,WETH,DAI&bases=USDC&amount=1000000&minProfitPct=0&minProfitAbs=0&slippageBps=30`;
  const res = await fetchFn(url);
  assert.ok(res.ok, `arb cycles status ${res.status}`);
  const body = await res.json();
  assert.ok(Array.isArray(body.opportunities), "opportunities should be an array");
});

test("DEX history returns samples", async () => {
  const url = `${API_BASE}/dex/history?chainId=1&sellToken=USDC&buyToken=WETH&windowMinutes=10&amount=1000000`;
  const res = await fetchFn(url);
  assert.ok(res.ok, `dex history status ${res.status}`);
  const body = await res.json();
  assert.ok(Array.isArray(body.samples), "samples should be array");
  // May be empty if RPC rate-limited or window too narrow
  if (body.samples.length > 0) {
    assert.ok(body.samples[0].price > 0, "first sample should have price");
  }
});

test("Arb history returns events array", async () => {
  const url = `${API_BASE}/arb/history?chainId=1&tokens=USDC,WETH,DAI&windowMinutes=10&amount=1000000`;
  const res = await fetchFn(url);
  assert.ok(res.ok, `arb history status ${res.status}`);
  const body = await res.json();
  assert.ok(Array.isArray(body.events), "events should be array");
});

test("Historical arb + indicator scan for USDC/WETH/DAI", async () => {
  // pull history for all three legs
  const pairs = [
    { sell: "USDC", buy: "WETH" },
    { sell: "WETH", buy: "DAI" },
    { sell: "DAI", buy: "USDC" }
  ];
  const histories = [];
  for (const p of pairs) {
    // two attempts: default window, then shorter interval to boost sample count
    const tryFetch = async (win, interval, minSamples = 3) => {
      const url = `${API_BASE}/dex/history?chainId=1&sellToken=${p.sell}&buyToken=${p.buy}&windowMinutes=${win}&intervalSeconds=${interval}&minSamples=${minSamples}`;
      const res = await fetchFn(url);
      assert.ok(res.ok, `dex history ${p.sell}/${p.buy} status ${res.status}`);
      return res.json();
    };
    let body = await tryFetch(15, 30, 5);
    if (body.samples.length < 2) {
      body = await tryFetch(5, 10, 5);
    }
    if (body.samples.length < 2) {
      // not enough data to assert; skip gracefully
      return;
    }
    histories.push({ pair: `${p.sell}/${p.buy}`, samples: body.samples });
  }

  // simple indicator: price drift over window (acts like a momentum signal)
  const indicatorMoments = histories.map((h) => {
    const first = h.samples[0].price;
    const last = h.samples[h.samples.length - 1].price;
    const drift = (last - first) / first;
    assert.ok(Number.isFinite(drift), `${h.pair} drift should be finite`);
    return { pair: h.pair, drift };
  });
  // At least one pair should show non-zero drift (trend signal)
  const hasMovement = indicatorMoments.some((m) => Math.abs(m.drift) > 0);
  assert.ok(hasMovement, "at least one pair should have non-zero drift over the window");

  // historical arb events over same window
  const arbUrl = `${API_BASE}/arb/history?chainId=1&tokens=USDC,WETH,DAI&windowMinutes=15&intervalSeconds=30&minProfitPct=0`;
  const arbRes = await fetchFn(arbUrl);
  assert.ok(arbRes.ok, `arb history status ${arbRes.status}`);
  const arbBody = await arbRes.json();
  assert.ok(Array.isArray(arbBody.events), "arb events should be array");
  assert.ok(arbBody.events.length > 0, "arb history should include events");
  arbBody.events.forEach((e) => {
    assert.ok(typeof e.profitPct === "number", "profitPct should be number");
    assert.ok(typeof e.meetsTarget === "boolean", "meetsTarget should be boolean");
  });
  // Print a quick summary to console for debugging/inspection
  const top = arbBody.events.slice(0, 3).map((e) => ({
    profitPct: e.profitPct,
    meetsTarget: e.meetsTarget,
    ts: e.ts,
    blockNumber: e.blockNumber
  }));
  // eslint-disable-next-line no-console
  console.log("arb history summary:", JSON.stringify(top, null, 2));
});
