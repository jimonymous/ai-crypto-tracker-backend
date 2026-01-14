import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db";

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

export type MarketBackup = {
  exportedAt: string;
  markets: any[];
  candles: any[];
};

const defaultPath = path.resolve(process.cwd(), "data", "market-backup.json");

const replacer = (_key: string, value: any) => {
  if (typeof value === "bigint") return value.toString();
  return value;
};

const reviver = (key: string, value: any) => {
  if (key === "timestamp" && typeof value === "string" && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return value;
};

export const backupMarketData = async (filePath = defaultPath) => {
  const markets = await prisma.market.findMany();
  const candles = await prisma.candle.findMany();
  const payload: MarketBackup = {
    exportedAt: new Date().toISOString(),
    markets,
    candles
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, replacer));
  return { filePath, markets: markets.length, candles: candles.length };
};

export const restoreMarketData = async (filePath = defaultPath) => {
  if (!fs.existsSync(filePath)) {
    return { restored: false, reason: "missing file", filePath };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw, reviver) as MarketBackup;
  if (!payload.markets?.length) {
    return { restored: false, reason: "no markets in backup", filePath };
  }

  if (payload.markets?.length) {
    await prisma.market.createMany({ data: payload.markets, skipDuplicates: true });
  }
  if (payload.candles?.length) {
    // avoid exceeding parameter limits by chunking
    for (const batch of chunk(payload.candles, 1000)) {
      await prisma.candle.createMany({ data: batch, skipDuplicates: true });
    }
  }
  return {
    restored: true,
    filePath,
    markets: payload.markets.length,
    candles: payload.candles?.length ?? 0
  };
};
