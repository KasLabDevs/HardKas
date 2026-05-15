import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    poolOptions: {
      forks: {
        execArgv: ["--no-warnings"]
      }
    },
    ssr: {
      external: ["node:sqlite"]
    }
  }
});
