import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { checkEnvironment, parseDotEnv, HARDKAS_ENV_VARIABLES } from "../src/commands/env.js";

// -----------------------------------------------------------------------------
// Mechanical fixes of 2026-10-05 (owner's list after CLI-RUNTIME-CONTRACT-1):
//   #3  accounts balance follows the workspace's default target, not a hardcoded simnet;
//   #8  dev accounts export parses its format and its alias, and a refusal is a failure;
//   #9  dev tx generate produces transactions (whole-KAS amounts; sub-KAS outputs were refused
//       for their storage mass);
//   #10 env check no longer demands the deployment profile of `deploy init`; it checks the
//       HARDKAS_* variables HardKAS reads and flags the ones it does not know.
// Real processes on the built CLI.
// -----------------------------------------------------------------------------

function run(args: string[], cwd: string, env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(env), encoding: "utf8", timeout: 180_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}
const single = (stdout: string) => JSON.parse(stdout.trim());

describe("mechanical papercuts · simulated workspace", () => {
  let ws: string;

  beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mech-"));
    const r = run(["init", "--skip-toolchain", "--json"], ws);
    expect(r.status, r.all).toBe(0);
  }, 120_000);

  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("#3 · accounts balance without --network reads the workspace's default target (the simulator), never simnet", () => {
    const r = run(["accounts", "balance", "alice", "--json"], ws);
    expect(r.status, r.all).toBe(0);
    const env = single(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.result.network).toBe("simulated");
    expect(BigInt(env.result.balanceSompi)).toBe(1000n * 100_000_000n);
    expect(r.all).not.toMatch(/Cannot connect to Kaspa RPC/);
    // an explicit --network still wins
    const explicit = run(["accounts", "balance", "alice", "--network", "simulated", "--json"], ws);
    expect(explicit.status, explicit.all).toBe(0);
    expect(single(explicit.stdout).result.network).toBe("simulated");
  }, 120_000);

  it("#9 · dev tx generate produces every requested transaction in a fresh simulated workspace", () => {
    const r = run(["dev", "tx", "generate", "--count", "3", "--json"], ws);
    expect(r.status, r.all).toBe(0);
    const out = single(r.stdout);
    expect(out).toMatchObject({ ok: true, generated: 3, successCount: 3, failCount: 0 });
    expect(out.results.every((x: any) => x.ok)).toBe(true);
    expect(r.all).not.toMatch(/OUTPUT_BELOW_STANDARD_AMOUNT/);
  }, 180_000);

  it("#8 · dev accounts export parses `kasware` and --alias; an unknown alias or format is a typed failure, exit ≠ 0", () => {
    const bad = run(["dev", "accounts", "export", "kasware", "--alias", "nobody"], ws);
    expect(bad.status, bad.all).not.toBe(0);
    expect(bad.all).toMatch(/DEV_ACCOUNT_NOT_FOUND/);
    expect(bad.all).toMatch(/'nobody'/);
    expect(bad.all).not.toMatch(/'undefined'/);

    const format = run(["dev", "accounts", "export", "ledger", "--alias", "alice"], ws);
    expect(format.status, format.all).toBe(2);
    expect(format.all).toMatch(/DEV_EXPORT_FORMAT_UNKNOWN/);
  }, 120_000);
});

describe("#10 · env check", () => {
  it("unit · the deployment profile is informational and only when a .env declares it; unknown HARDKAS_* names are flagged", () => {
    const report = checkEnvironment({ PATH: "x", HARDKAS_HOME: "/h", HARDKAS_HOEM: "typo", HARDKAS_TEST_IGNORE_STALENESS: "1" }, null);
    expect(report.known.map((k) => k.name)).toEqual(["HARDKAS_HOME", "HARDKAS_TEST_IGNORE_STALENESS"]);
    expect(report.unknown).toEqual(["HARDKAS_HOEM"]);
    expect(report.deployProfile).toBeNull();

    const withProfile = checkEnvironment({}, parseDotEnv("NETWORK=testnet\nKASPAD_URL=\n# comment\nHARDKAS_KASPAD_IMAGE=img\n"));
    expect(withProfile.deployProfile).toEqual({ present: ["NETWORK", "HARDKAS_KASPAD_IMAGE"], missing: ["KASPAD_URL", "HARDKAS_DATA_DIR", "LOG_LEVEL"] });
    expect(withProfile.known.map((k) => k.name)).toEqual(["HARDKAS_KASPAD_IMAGE"]);
    expect(withProfile.known[0]!.source).toBe(".env");
    expect(HARDKAS_ENV_VARIABLES.map((v) => v.name)).toContain("HARDKAS_KASPAD_IMAGE");
  });

  it("e2e · a workspace without a deployment .env passes (exit 0); a typo in a HARDKAS_* name fails with ENV_UNKNOWN_VARIABLE", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-env-"));
    try {
      const ok = run(["env", "check", "--json"], dir);
      expect(ok.status, ok.all).toBe(0);
      expect(single(ok.stdout)).toMatchObject({ ok: true, command: "env check" });
      expect(ok.all).not.toMatch(/Missing required environment variables/);

      const typo = run(["env", "check", "--json"], dir, { HARDKAS_HOEM: "oops" });
      expect(typo.status, typo.all).toBe(2);
      expect(single(typo.stdout)).toMatchObject({ ok: false, code: "ENV_UNKNOWN_VARIABLE" });

      const human = run(["env", "check"], dir, { HARDKAS_HOEM: "oops" });
      expect(human.status).toBe(2);
      expect(human.all).toMatch(/HARDKAS_HOEM/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
