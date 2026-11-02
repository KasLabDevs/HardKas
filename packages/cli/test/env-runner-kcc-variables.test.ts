import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { checkEnvironment } from "../src/commands/env.js";

// -----------------------------------------------------------------------------
// The HARDKAS_* variables of the SilverScript runner and of the KCC-20 test levels in the one environment contract
// (D-2, I-03, R-08):
// - @hardkas/core reads HARDKAS_SILVER_RUNNER (the runner binary) and HARDKAS_SILVER_RUNNER_TRUST (the R-04 opt-in):
//   `env check` and `doctor` list them as known, never as a typo (ENV_UNKNOWN_VARIABLE);
// - only the tests read HARDKAS_TEST_KCC20_REFERENCE and HARDKAS_TEST_KCC20_COMPUTE_BUDGET: the exempt test prefix;
// - HARDKAS_SILVER_RUNNER_TRUST=allow-unverified relaxes the runner policy for every command: a warning, never a plain ✅.
// -----------------------------------------------------------------------------

const SET = {
  HARDKAS_SILVER_RUNNER: "/opt/cli-debugger",
  HARDKAS_SILVER_RUNNER_TRUST: "allow-unverified",
  HARDKAS_TEST_KCC20_REFERENCE: "/opt/kcc20-reference",
  HARDKAS_TEST_KCC20_COMPUTE_BUDGET: "300"
};

function envCheck(args: string[], env: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-env-runner-"));
  try {
    const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: dir, env: childEnv(env), encoding: "utf8", timeout: 120_000 });
    return { status: r.status, stdout: String(r.stdout), all: `${r.stdout}\n${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("env contract · the SilverScript runner and the KCC-20 test variables", () => {
  it("unit · the runner variables are known, the test variables are exempt, nothing is unknown", () => {
    const report = checkEnvironment({ PATH: "x", ...SET }, null);
    expect(report.unknown).toEqual([]);
    expect(report.known.map((k) => k.name).sort()).toEqual(["HARDKAS_SILVER_RUNNER", "HARDKAS_SILVER_RUNNER_TRUST"]);
  });

  it("unit · R-08: the global runner opt-in is a warning; an explicit require-verified (or anything else) is not", () => {
    const relaxed = checkEnvironment({ HARDKAS_SILVER_RUNNER_TRUST: "allow-unverified" }, null);
    expect(relaxed.warnings.map((w) => w.name)).toEqual(["HARDKAS_SILVER_RUNNER_TRUST"]);
    expect(relaxed.warnings[0]!.message).toMatch(/--allow-unverified-runner/);
    expect(checkEnvironment({ HARDKAS_SILVER_RUNNER_TRUST: "require-verified" }, null).warnings).toEqual([]);
    expect(checkEnvironment({ HARDKAS_ALLOW_UNVERIFIED_NODE: "1" }, null).warnings.map((w) => w.name)).toEqual(["HARDKAS_ALLOW_UNVERIFIED_NODE"]);
  });

  it("e2e · `env check --json` with them set exits 0, flags nothing unknown and carries the warning", () => {
    const r = envCheck(["env", "check", "--json"], SET);
    expect(r.status, r.all).toBe(0);
    const out = JSON.parse(r.stdout.trim());
    expect(out).toMatchObject({ ok: true, command: "env check" });
    expect(out.result.unknown).toEqual([]);
    expect(out.result.warnings.map((w: any) => w.name)).toEqual(["HARDKAS_SILVER_RUNNER_TRUST"]);
  });

  it("e2e · the human `env check` marks the global opt-in with ⚠️, never ✅", () => {
    const r = envCheck(["env", "check"], { HARDKAS_SILVER_RUNNER_TRUST: "allow-unverified" });
    expect(r.status, r.all).toBe(0);
    expect(r.all).toMatch(/⚠️ HARDKAS_SILVER_RUNNER_TRUST=allow-unverified/);
    expect(r.all).not.toMatch(/✅ HARDKAS_SILVER_RUNNER_TRUST/);
  });
});
