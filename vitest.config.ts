import { defineConfig } from "vitest/config";
import { mkdirSync } from "node:fs";
import { hardkasWorkspaceSources } from "./vitest.workspace-resolver.js";

// Ensure coverage temp directory exists (vitest v8 provider writes temp files here)
mkdirSync("./coverage/internal/.tmp", { recursive: true });

/**
 * Canonical gate (unit level). It must pass on a fresh checkout with the
 * supported toolchain baseline only (kaspa-wasm installed through
 * `hardkas toolchain install kaspa-wasm`): no Docker, no silverc, no network.
 * `node scripts/gate-hermetic.mjs --home <baseline>` runs it under exactly
 * those conditions.
 *
 * Suites that need more run at their own level and never here:
 *   *.silverc.test.ts   vitest.silverc.config.ts   pinned silverc installed in HARDKAS_HOME
 *   *.simnet.test.ts    vitest.simnet.config.ts    kaspad raised in Docker by the harness
 *   *.localnet.test.ts  vitest.localnet.config.ts  managed localnet + dev-server
 *   *.e2e.test.ts       vitest.e2e.config.ts
 *
 * `@hardkas/*` imports resolve to workspace sources through each package's own
 * `exports` map (vitest.workspace-resolver.ts), so subpath exports are tested
 * exactly as consumers import them.
 */
export default defineConfig({
  plugins: [hardkasWorkspaceSources()],
  test: {
    fileParallelism: false,

    teardownTimeout: 120000,
    hookTimeout: 120000,
    include: ["packages/*/test/**/*.test.ts", "examples/superapp-command-center/tests/backend/**/*.test.ts", "examples/builder-labs/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.e2e.test.ts",
      "**/*.localnet.test.ts",
      "**/*.simnet.test.ts",
      "**/*.silverc.test.ts"
    ],
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
