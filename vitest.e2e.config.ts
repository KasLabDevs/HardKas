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
    // REMED-CLOSE: a run that leaves anything in the repository root's .hardkas fails, naming it
    globalSetup: ["./scripts/vitest-root-hygiene.global-setup.ts"],
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
