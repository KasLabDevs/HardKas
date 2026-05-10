import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

const cliPath = path.resolve(__dirname, "../src/index.ts");
const tsx = "npx tsx";

function runHardkas(args: string) {
  try {
    const stdout = execSync(`${tsx} "${cliPath}" ${args}`, { encoding: "utf8", stdio: "pipe" });
    return { ok: true, stdout };
  } catch (e: any) {
    return { ok: false, stdout: e.stdout, stderr: e.stderr, status: e.status };
  }
}

describe("CLI Smoke Tests", () => {
  it("should show help", () => {
    const result = runHardkas("--help");
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("Usage: hardkas [options] [command]");
  });

  it("should show init help", () => {
    const result = runHardkas("init --help");
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("Initialize a new HardKAS project");
  });

  it("should show rpc doctor help", () => {
    const result = runHardkas("rpc doctor --help");
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("Run comprehensive RPC diagnostics");
  });

  it("should explain an artifact (mocked file)", () => {
    const fixturePath = path.resolve(__dirname, "../../../packages/artifacts/test/fixtures/golden/tx-plan.valid.json");
    const result = runHardkas(`artifact explain "${fixturePath}"`);
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("Operational Audit");
    expect(result.stdout).toContain("TXPLAN");
  });

  it("should verify golden fixtures in strict mode", () => {
    const fixtureDir = path.resolve(__dirname, "../../../packages/artifacts/test/fixtures/golden");
    const result = runHardkas(`artifact verify "${fixtureDir}" --recursive --strict`);
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("Audit Complete");
  });

  it("should fail to verify corrupted fixtures in strict mode", () => {
    const fixtureDir = path.resolve(__dirname, "../../../packages/artifacts/test/fixtures/corrupted");
    const result = runHardkas(`artifact verify "${fixtureDir}" --recursive --strict`);
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
  });

  it("should show dag status help", () => {
    const result = runHardkas("dag status --help");
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("View current DAG status");
  });
});
