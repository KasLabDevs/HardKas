import { defineConfig } from "vitest/config";
import { mkdirSync } from "node:fs";

// Ensure coverage temp directory exists (vitest v8 provider writes temp files here)
mkdirSync("./coverage/internal/.tmp", { recursive: true });

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@hardkas\/(.*)$/, replacement: new URL('./packages/$1/src/index.ts', import.meta.url).pathname }
    ]
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "examples/superapp-command-center/tests/backend/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.e2e.test.ts"],
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
