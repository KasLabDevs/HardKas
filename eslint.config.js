import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.js", "**/*.mjs", "**/*.d.ts"]
  },
  // RC1 · R3: the CommonJS fixtures (*.cjs, e.g. packages/cli/test/fixtures) run under Node: `require` and `process`
  // are Node's globals there, not undefined names, and a module-scoped `const crypto = require("node:crypto")` only
  // shadows Node's global `crypto` inside that module (legal CommonJS), so it is not a redeclaration.
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node }
    },
    rules: {
      "no-redeclare": ["error", { builtinGlobals: false }]
    }
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-empty": "off",
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-useless-escape": "off",
      "prefer-const": "off",
      "no-useless-catch": "off",
      "no-control-regex": "off"
    }
  }
);
