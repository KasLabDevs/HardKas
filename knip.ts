import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    ".": {
      entry: [
        "apps/**/src/**/*.{ts,tsx}",
        "examples/**/*.{ts,tsx,js,mjs}",
        "labs/**/*.{ts,tsx,js,mjs}",
        "scripts/**/*.{ts,js,mjs}",
        "docs/examples/**/*.{ts,tsx}",
        "templates/**/*",
        "benchmarks/**/*.{ts,tsx,js,mjs}",
        "migrations/**/*"
      ],
      project: ["**/*.{ts,tsx,js,mjs}"]
    },
    "packages/*": {
      entry: [
        "src/index.ts",
        "src/cli.ts",
        "src/bin.ts",
        "test/**/*.{ts,tsx,js,mjs}",
        "tests/**/*.{ts,tsx,js,mjs}",
        "fixtures/**/*",
        "dummy-project/**/*"
      ],
      project: ["src/**/*.{ts,tsx,js,mjs}", "test/**/*.{ts,tsx,js,mjs}", "tests/**/*.{ts,tsx,js,mjs}"]
    },
    "examples/showcase-suite/apps/*": {
      entry: [
        "src/**/*.{ts,tsx}",
        "vite.config.ts"
      ],
      project: ["src/**/*.{ts,tsx}"]
    }
  },
  ignore: [
    "dist/**",
    "coverage/**",
    "extract/**",
    "vendor/kaspa-wasm/**" // generated upstream vendor code
  ],
  ignoreDependencies: [
    "kaspa-wasm",
    "tsx",
    "vitest",
    "zod"
  ],
  ignoreBinaries: [
    "pnpm"
  ]
};

export default config;
