import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

describe("Network management", () => {
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

  it("lists built-in networks in JSON", () => {
    const result = runHardkas("networks --json");
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty("simnet");
    expect(parsed).toHaveProperty("testnet-11");
    expect(parsed).toHaveProperty("mainnet");
  });

  it("human output shows networks table", () => {
    const result = runHardkas("networks");
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("Network");
    expect(result.stdout).toContain("simnet");
    expect(result.stdout).toContain("testnet-11");
    expect(result.stdout).toContain("mainnet");
  });
});
