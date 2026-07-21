import { defineConfig } from "vitest/config";
import { mkdirSync } from "node:fs";

// Ensure coverage temp directory exists (vitest v8 provider writes temp files here)
mkdirSync("./coverage/internal/.tmp", { recursive: true });

export default defineConfig({
  resolve: {
    alias: [
      { find: "@hardkas/accounts/internal/wasm-rpc-serialization.js", replacement: new URL('./packages/accounts/src/internal/wasm-rpc-serialization.ts', import.meta.url).pathname },
      { find: "@hardkas/pskt-native", replacement: new URL('./packages/pskt-native/index.js', import.meta.url).pathname },
      { find: /^@hardkas\/(.*)$/, replacement: new URL('./packages/$1/src/index.ts', import.meta.url).pathname }
    ]
  },
  test: {
    teardownTimeout: 120000,
    hookTimeout: 120000,
    include: ["packages/*/test/**/*.test.ts", "examples/superapp-command-center/tests/backend/**/*.test.ts", "examples/builder-labs/**/*.test.ts"],
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
