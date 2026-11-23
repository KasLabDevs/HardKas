import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

const cliPath = path.resolve(__dirname, "../src/index.ts");
const tsx = "npx tsx";

function runHardkas(args: string) {
  try {
    const stdout = execSync(`${tsx} "${cliPath}" ${args}`, {
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1" }
    });
    return { ok: true, stdout };
  } catch (e: unknown) {
    return { ok: false, stdout: ((e as any).stdout), stderr: ((e as any).stderr), status: e.status };
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
    expect(result.stdout).toContain("Probe RPC endpoints");
  });

  it("should explain an artifact (mocked file)", () => {
    const fixturePath = path.resolve(
      __dirname,
      "../../../packages/artifacts/test/fixtures/golden/tx-plan.valid.json"
    );
    const result = runHardkas(`artifact explain "${fixturePath}"`);
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("Operational Audit");
    expect(result.stdout).toContain("TXPLAN");
  });

  // The golden fixtures are the backward-compatibility corpus: artifacts of hashVersion 4 (and, for the snapshot, the
  // pre-registry schema name "hardkas.snapshot"). Strict verification requires the current hashVersion, so refusing
  // them is the contract, not a defect: the verdict names the migration. (Not strict: the plan and the signed
  // transaction still verify; the legacy snapshot does not, its schema name is not in the registry.)
  it("strict verify refuses the golden (hashVersion 4) fixtures and names the migration", () => {
    const fixtureDir = path.resolve(
      __dirname,
      "../../../packages/artifacts/test/fixtures/golden"
    );
    const result = runHardkas(`artifact verify "${fixtureDir}" --recursive --strict`);
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
    const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(out.match(/MIGRATION_REQUIRED/g)?.length ?? 0).toBe(3);
    expect(out).toMatch(/requires 5/);
  });

  it("without --strict the golden plan and signed transaction verify (MATCH)", () => {
    const fixtureDir = path.resolve(
      __dirname,
      "../../../packages/artifacts/test/fixtures/golden"
    );
    const out = ((r) => `${r.stdout ?? ""}${r.stderr ?? ""}`)(runHardkas(`artifact verify "${fixtureDir}" --recursive`));
    expect(out).toMatch(/✓ signed-tx\.valid\.json\s+\[MATCH\]/);
    expect(out).toMatch(/✓ tx-plan\.valid\.json\s+\[MATCH\]/);
  });

  it("should fail to verify corrupted fixtures in strict mode", () => {
    const fixtureDir = path.resolve(
      __dirname,
      "../../../packages/artifacts/test/fixtures/corrupted"
    );
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
