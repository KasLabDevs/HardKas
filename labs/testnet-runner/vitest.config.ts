import { defineConfig } from "vitest/config";

// WALLET-HD-0: this lab's tests are run explicitly (they are outside the repo's main gate):
//   pnpm exec vitest run --root labs/testnet-runner --config labs/testnet-runner/vitest.config.ts
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"]
  }
});
