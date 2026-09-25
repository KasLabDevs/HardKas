import { defineConfig } from "vitest/config";
import defaultConfig from "./vitest.config.js";

export default defineConfig({
  ...defaultConfig,
  test: {
    ...defaultConfig.test,
    globalSetup: ["./packages/dev-server/test/global-setup.ts"],
    include: ["**/*.localnet.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"]
  }
});
