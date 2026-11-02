import { defineConfig } from "vitest/config";
import { hardkasWorkspaceSources } from "./vitest.workspace-resolver.js";

/**
 * Anvil level: L2 (EVM) suites that need a local Anvil node (`*.anvil.test.ts`).
 * Excluded from the canonical gate (`vitest.config.ts`), which must run without Docker or network.
 *
 * The harness (packages/l2/test/harness/local-evm-node.ts) prefers a native `anvil` binary; otherwise
 * it starts Docker with the pinned image and `--pull=never`, so a missing image is an explicit error
 * instead of a download. Every container carries this process's run label and cleanup removes only
 * those containers.
 */
export default defineConfig({
  plugins: [hardkasWorkspaceSources()],
  test: {
    fileParallelism: false,
    pool: "forks",
    include: ["packages/*/test/**/*.anvil.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.*/**"],
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: { enabled: false }
  }
});
