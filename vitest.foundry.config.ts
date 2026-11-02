import { defineConfig } from "vitest/config";
import { hardkasWorkspaceSources } from "./vitest.workspace-resolver.js";

/**
 * L2-EXT stage 3 · the real Foundry release assets (*.foundry.test.ts). Never part of the canonical gate: it needs the
 * pinned ~120 MB assets on disk, in HARDKAS_FOUNDRY_ASSETS/<platform>/<assetName>, and the built CLI and extension.
 * It runs offline: every CLI child carries the hermetic preload and the suite fails on any non-loopback attempt.
 */
export default defineConfig({
  plugins: [hardkasWorkspaceSources()],
  test: {
    include: ["packages/*/test/**/*.foundry.test.ts"],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000
  }
});
