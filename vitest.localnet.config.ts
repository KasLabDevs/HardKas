import { defineConfig } from "vitest/config";
import defaultConfig from "./vitest.config.js";

export default defineConfig({
  ...defaultConfig,
  test: {
    ...defaultConfig.test,
    // REMED-CLOSE: the root .hardkas guard first (its teardown runs last), then the level's node, workspace and dev-server
    globalSetup: ["./scripts/vitest-root-hygiene.global-setup.ts", "./packages/dev-server/test/global-setup.ts"],
    include: ["**/*.localnet.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // A real node: plans, sends and waits for blocks (W2 and W3 wait 5 s themselves), as the simnet level allows.
    // Without it the level inherited vitest's 5 s default, which those tests cannot meet.
    testTimeout: 120000
  }
});
