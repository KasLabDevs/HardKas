import { defineConfig } from "vitest/config";
import { hardkasWorkspaceSources } from "./vitest.workspace-resolver.js";

/**
 * Live L2 level: READ-ONLY checks against public L2 endpoints (`*.live.test.ts`), e.g. Igra Galleon.
 * Each suite is additionally gated by its own env flag (TEST_IGRA_GALLEON=1). Never in the canonical gate.
 */
export default defineConfig({
  plugins: [hardkasWorkspaceSources()],
  test: {
    fileParallelism: false,
    include: ["packages/*/test/**/*.live.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.*/**"],
    testTimeout: 60000,
    coverage: { enabled: false }
  }
});
