import { defineConfig } from "vitest/config";
import { mkdirSync } from "node:fs";
import { hardkasWorkspaceSources } from "./vitest.workspace-resolver.js";

// Ensure coverage temp directory exists (vitest v8 provider writes temp files here)
mkdirSync("./coverage/internal/.tmp", { recursive: true });

export default defineConfig({
  plugins: [hardkasWorkspaceSources()],
  test: {
    include: ["packages/*/test/**/*.e2e.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      enabled: false,
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
