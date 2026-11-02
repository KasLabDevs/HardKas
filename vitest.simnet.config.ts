import { defineConfig } from "vitest/config";
import { hardkasWorkspaceSources } from "./vitest.workspace-resolver.js";

/**
 * Simnet level (L3): suites that raise a real kaspad through the Docker
 * harness (`*.simnet.test.ts`). They are excluded from the canonical gate
 * (`vitest.config.ts`), which must run without Docker or network (AUD-06).
 * With KASPAD_BIN naming a kaspad binary the harness starts that binary
 * instead (no Docker daemon): the suite that checks Docker container hygiene
 * itself (harness-cleanup) then fails, explicitly, for want of Docker.
 *
 * The global setup assigns one run id to the whole invocation; every container
 * the harness starts carries it as a label, and teardown removes whatever still
 * carries that label, so a timed-out or killed worker cannot leave a node behind
 * and containers that are not ours are never touched.
 *
 * The examples' own tests of this level (examples/<n>/test/*.simnet.test.ts)
 * run here too: an example's test that no configuration includes never runs.
 */
export default defineConfig({
  plugins: [hardkasWorkspaceSources()],
  test: {
    fileParallelism: false,
    pool: "forks",
    // Rooted like the canonical gate: never glob into hidden directories or stale worktrees.
    include: ["packages/*/test/**/*.simnet.test.ts", "examples/*/test/**/*.simnet.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.*/**"],
    // REMED-CLOSE: the root .hardkas guard first (its teardown runs last), then the run-scoped container sweep
    globalSetup: ["./scripts/vitest-root-hygiene.global-setup.ts", "./packages/testing/test/simnet-global-setup.ts"],
    testTimeout: 180000,
    hookTimeout: 180000,
    teardownTimeout: 120000,
    coverage: { enabled: false }
  }
});
