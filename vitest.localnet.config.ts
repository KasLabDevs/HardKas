import { defineConfig } from "vitest/config";
import defaultConfig from "./vitest.config.js";

export default defineConfig({
  ...defaultConfig,
  test: {
    ...defaultConfig.test,
    include: ["**/*.localnet.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"]
  }
});
