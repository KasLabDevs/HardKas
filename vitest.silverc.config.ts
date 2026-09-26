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
 */
export default defineConfig({
  plugins: [hardkasWorkspaceSources()],
  test: {
    fileParallelism: false,
    pool: "forks",
    // Rooted like the canonical gate: never glob into hidden directories or stale worktrees.
    include: ["packages/*/test/**/*.silverc.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.*/**"],
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: { enabled: false }
  }
});
