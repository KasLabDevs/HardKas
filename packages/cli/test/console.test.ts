import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

describe("hardkas console", () => {
  const cliPath = resolve("src/index.ts");
  const tsxBin = resolve("../../node_modules/.bin/tsx");
  const actualTsx = existsSync(tsxBin) ? tsxBin : "npx tsx";

  function runHardkas(args: string) {
    try {
      const stdout = execSync(`${actualTsx} ${cliPath} ${args}`, {
        env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
        encoding: "utf-8"
      });
      return { ok: true, stdout };
    } catch (err: any) {
      return { ok: false, stdout: err.stdout?.toString(), stderr: err.stderr?.toString() };
    }
  }

  it("command is registered and shows help", () => {
    const result = runHardkas("console --help");
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("interactive REPL");
    expect(result.stdout).toContain("--accounts");
    expect(result.stdout).toContain("--balance");
  });
});
