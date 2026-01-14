import fs from "node:fs";
import path from "node:path";

type HistoryEntry = {
  dex: string;
  chain: string;
  token0: string;
  token1: string;
  fee?: number;
  address: string;
  creationBlock: number | null;
};

type CandleTask = {
  chain: string;
  address: string;
  token0: string;
  token1: string;
  fee?: number;
  creationBlock?: number;
  intervalSeconds: number;
  windowMinutes: number;
};

const WINDOWS: CandleTask["intervalSeconds"][] = [60, 300];
const DURATIONS: Record<number, number> = {
  60: 60 * 24, // 24h
  300: 60 * 24 * 28 // 28d
};

function buildTasks(entries: HistoryEntry[]): CandleTask[] {
  const tasks: CandleTask[] = [];
  for (const e of entries) {
    for (const intervalSeconds of WINDOWS) {
      const windowMinutes = DURATIONS[intervalSeconds];
      tasks.push({
        chain: e.chain,
        address: e.address,
        token0: e.token0,
        token1: e.token1,
        fee: e.fee,
        creationBlock: e.creationBlock ?? undefined,
        intervalSeconds,
        windowMinutes
      });
    }
  }
  return tasks;
}

function main() {
  const histPath = path.join(process.cwd(), "apps/api/discovered_pools_history.json");
  if (!fs.existsSync(histPath)) {
    console.error("discovered_pools_history.json not found. Run poolHistory.ts first.");
    process.exit(1);
  }
  const history = JSON.parse(fs.readFileSync(histPath, "utf-8")) as { detailed: HistoryEntry[] };
  const tasks = buildTasks(history.detailed);
  const outPath = path.join(process.cwd(), "apps/api/candle_schedule.json");
  fs.writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), tasks }, null, 2));
  console.log(`Wrote ${outPath} with ${tasks.length} tasks.`);
  console.log("Example curl (adjust host):");
  console.log(
    `curl 'http://localhost:4000/dex/candles?chainId=1&poolAddress=${tasks[0]?.address}&intervalSeconds=${tasks[0]?.intervalSeconds}&windowMinutes=${tasks[0]?.windowMinutes}&creationBlock=${tasks[0]?.creationBlock ?? ""}'`
  );
}

main();
