import { PrismaClient } from "@prisma/client";
import { config } from "./config";

const logLevels: ("query" | "info" | "warn" | "error")[] = config.isProduction
  ? ["warn", "error"]
  : ["query", "info", "warn", "error"];

export const prisma = new PrismaClient({
  log: logLevels
});
