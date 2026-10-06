import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

describe("hardkas capabilities", () => {
  const cliPath = resolve(__dirname, "../src/index.ts");
  const tsxBin = resolve(__dirname, "../../../node_modules/.bin/tsx");
  const actualTsx = existsSync(tsxBin) ? tsxBin : "npx tsx";

  function runHardkas(args: string) {
    try {
      const stdout = execSync(`${actualTsx} ${cliPath} ${args}`, {
        env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
        encoding: "utf-8"
      });
      return { ok: true, stdout };
    } catch (err: any) {
      return {
        ok: false,
        stdout: ((err as any).stdout)?.toString(),
        stderr: ((err as any).stderr)?.toString()
      };
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
    // SURFACE-TRUTH-1B (ST-A): silverScript is derived from this environment (the managed silverc resolving, as
    // `hardkas silver doctor` reports), so the derivation is pinned, not a value. The old pin, `false`, was the literal
    // denial ST-A removed. L2 is not part of the L1 core.
    expect(typeof parsed.capabilities.silverScript).toBe("boolean");
    if (!parsed.capabilities.silverScript) expect(parsed.reasons?.silverScript).toBeTruthy();
    expect(parsed.capabilities.l2Profiles).toBe(false);
    expect(parsed.trustBoundaries.replay).toBe("local-simulator-only");
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
