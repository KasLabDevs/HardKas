import { defineConfig } from "vitest/config";
import { hardkasWorkspaceSources } from "./vitest.workspace-resolver.js";

/**
 * SilverScript runner level (experimental): suites that run contract tests on
 * the SilverScript runner, a local `cli-debugger` build (`*.silver-runner.test.ts`). Preconditions:
 * the pinned silverc installed for the HARDKAS_HOME in use, and
 * HARDKAS_SILVER_RUNNER naming a `cli-debugger` built from the pinned
 * SilverScript release (upstream publishes no runner binary). Without them the
 * suites fail with SILVER_RUNNER_NOT_CONFIGURED or
 * SILVERC_TOOLCHAIN_NOT_INSTALLED; they never skip.
 *
 * Kept out of the canonical gate: neither the runner nor a Rust toolchain is
 * part of the supported baseline.
 *
 * R-04: no trusted reference exists for any runner (no release binary to take
 * one from), so every runner is UNVERIFIED and HardKAS refuses to execute one
 * by default. This level is the experimental one: it accepts the local build
 * explicitly (HARDKAS_SILVER_RUNNER_TRUST=allow-unverified) and every verdict
 * it produces carries the runner's identity with trust UNVERIFIED.
 *
 * The examples' own tests of this level (examples/<n>/test/*.silver-runner.test.ts)
 * run here too: an example's test that no configuration includes never runs.
 */
export default defineConfig({
  plugins: [hardkasWorkspaceSources()],
  test: {
    fileParallelism: false,
    pool: "forks",
    include: ["packages/*/test/**/*.silver-runner.test.ts", "examples/*/test/**/*.silver-runner.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.*/**"],
    // REMED-CLOSE: a run that leaves anything in the repository root's .hardkas fails, naming it
    globalSetup: ["./scripts/vitest-root-hygiene.global-setup.ts"],
    testTimeout: 120000,
    hookTimeout: 60000,
    env: { HARDKAS_SILVER_RUNNER_TRUST: "allow-unverified" },
    coverage: { enabled: false }
  }
});
