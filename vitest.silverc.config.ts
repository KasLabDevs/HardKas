import { defineConfig } from "vitest/config";
import { hardkasWorkspaceSources } from "./vitest.workspace-resolver.js";

/**
 * silverc level: suites that compile or recompile SilverScript with the pinned
 * official compiler (`*.silverc.test.ts`). Precondition: `hardkas toolchain
 * install silverc` has run for the HARDKAS_HOME in use. Without it the suites
 * fail with SILVERC_TOOLCHAIN_NOT_INSTALLED; they never skip.
 *
 * Kept out of the canonical gate (vitest.config.ts) so that gate does not
 * depend on a compiler that is neither part of the repository nor of the
 * supported baseline (AUD-41).
 *
 * The examples' own tests of this level (examples/<n>/test/*.silverc.test.ts)
 * run here too: an example's test that no configuration includes never runs.
 */
export default defineConfig({
  plugins: [hardkasWorkspaceSources()],
  test: {
    fileParallelism: false,
    pool: "forks",
    // Rooted like the canonical gate: never glob into hidden directories or stale worktrees.
    include: ["packages/*/test/**/*.silverc.test.ts", "examples/*/test/**/*.silverc.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.*/**"],
    // REMED-CLOSE: a run that leaves anything in the repository root's .hardkas fails, naming it
    globalSetup: ["./scripts/vitest-root-hygiene.global-setup.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: { enabled: false }
  }
});
