import { defineConfig } from "vitest/config";
import { hardkasWorkspaceSources } from "./vitest.workspace-resolver.js";

/**
 * SilverScript runner level (experimental): suites that run contract tests on
 * the official SilverScript runner (`*.silver-runner.test.ts`). Preconditions:
 * the pinned silverc installed for the HARDKAS_HOME in use, and
 * HARDKAS_SILVER_RUNNER naming a `cli-debugger` built from the pinned
 * SilverScript release (upstream publishes no runner binary). Without them the
 * suites fail with SILVER_RUNNER_NOT_CONFIGURED or
 * SILVERC_TOOLCHAIN_NOT_INSTALLED; they never skip.
 *
 * Kept out of the canonical gate: neither the runner nor a Rust toolchain is
 * part of the supported baseline.
 */
export default defineConfig({
  plugins: [hardkasWorkspaceSources()],
  test: {
    fileParallelism: false,
    pool: "forks",
    include: ["packages/*/test/**/*.silver-runner.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.*/**"],
    testTimeout: 120000,
    hookTimeout: 60000,
    coverage: { enabled: false }
  }
});
