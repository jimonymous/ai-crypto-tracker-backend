import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    sequence: {
      concurrent: false
    },
    pool: "threads",
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 12
      }
    },
    testTimeout: 200_000,
    hookTimeout: 200_000,
    slowTestThreshold: 0,
    reporters: ["verbose"]
  }
});
