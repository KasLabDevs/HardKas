import { defineConfig } from "vitest/config";
import { mkdirSync } from "node:fs";

// Ensure coverage temp directory exists (vitest v8 provider writes temp files here)
mkdirSync("./coverage/internal/.tmp", { recursive: true });

export default defineConfig({
  resolve: {
    alias: {
      '@hardkas/toolkit': new URL('./packages/toolkit/src/index.ts', import.meta.url).pathname,
      '@hardkas/plugin-rpc-backend': new URL('./packages/plugin-rpc-backend/src/index.ts', import.meta.url).pathname
    }
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      enabled: true,
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "./coverage/internal",
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.test.ts",
        "**/fixtures/**"
      ]
    }
  }
});
