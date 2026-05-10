import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    alias: {
      "sqlite": "node:sqlite",
      "node:sqlite": "node:sqlite"
    }
  }
});
