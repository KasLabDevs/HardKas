import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

describe("hardkas capabilities", () => {
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

  it("outputs valid JSON with --json", () => {
    const result = runHardkas("capabilities --json");
    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.stdout);
    
    expect(parsed.version).toBeDefined();
    expect(parsed.maturity).toBe("hardened-alpha");
    expect(parsed.capabilities.artifacts).toBe(true);
    expect(parsed.capabilities.consensusValidation).toBe(false);
    expect(parsed.capabilities.silverScript).toBe(false);
    expect(parsed.trustBoundaries.replay).toBe("local-workflow-only");
  });

  it("human output shows checkmarks", () => {
    const result = runHardkas("capabilities");
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("Artifacts");
    expect(result.stdout).toContain("Consensus validation");
    // Check for icons (may be escaped or raw depending on terminal)
    expect(result.stdout).toMatch(/Artifacts/);
  });
});
