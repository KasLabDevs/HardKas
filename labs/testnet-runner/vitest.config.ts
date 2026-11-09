import { defineConfig } from "vitest/config";

// WALLET-HD-0: this lab's tests run in the repository's canonical gate (vitest.config.ts includes
// labs/testnet-runner/test since L-06, 2026-11-07). On their own:
//   pnpm exec vitest run --root labs/testnet-runner --config labs/testnet-runner/vitest.config.ts
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"]
  }
});
