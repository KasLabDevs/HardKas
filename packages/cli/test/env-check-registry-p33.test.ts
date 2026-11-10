import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { checkEnvironment, HARDKAS_ENV_VARIABLES } from "../src/commands/env.js";

// -----------------------------------------------------------------------------
// P33 / P34: the `env check` registry names every variable HardKAS reads.
// - HARDKAS_DEV_SERVER_AUTOSIGN (dev-server/routes/dapp-tx.ts), IGRA_RPC_URL (sdk/capabilities.ts) and the obsolete
//   HARDKAS_EXPERIMENTAL_L2 (cli/extensions/refusal.ts) are listed; HARDKAS_DEV_SERVER_URL (escrow suites) too;
// - the HARDKAS_DEV_SERVER_ prefix is no longer exempt, so a typo of the autosign variable is ENV_UNKNOWN_VARIABLE
//   instead of silently passing (it did before);
// - HARDKAS_DEV_SERVER_AUTOSIGN=1 relaxes a safety policy: a warning (R-08), never a plain pass. The autosign behaviour
//   itself is not changed here;
// - HARDKAS_NETWORK is described as what it is: set by `hardkas test` and `hardkas run`, read by no HardKAS package.
// Hermetic: the e2e runs `env check` only (no node, no network).
// -----------------------------------------------------------------------------

function envCheck(args: string[], env: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-env-p33-"));
  try {
    const base = childEnv(env);
    // the child sees only the variables this test sets among the ones under test
    for (const k of Object.keys(base)) if ((k.startsWith("HARDKAS_DEV_SERVER_") || k === "IGRA_RPC_URL" || k === "HARDKAS_EXPERIMENTAL_L2") && !(k in env)) delete base[k];
    const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: dir, env: base, encoding: "utf8", timeout: 120_000 });
    return { status: r.status, stdout: String(r.stdout), all: `${r.stdout}\n${r.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const meaningOf = (name: string) => HARDKAS_ENV_VARIABLES.find((v) => v.name === name)?.meaning;

describe("P33 · env check registry: dev-server, Igra and the obsolete L2 switch", () => {
  it("unit · the variables HardKAS reads are known; nothing is unknown", () => {
    const report = checkEnvironment(
      { PATH: "x", HARDKAS_DEV_SERVER_AUTOSIGN: "1", HARDKAS_DEV_SERVER_URL: "http://127.0.0.1:3000", IGRA_RPC_URL: "http://127.0.0.1:8545", HARDKAS_EXPERIMENTAL_L2: "1" },
      null
    );
    expect(report.unknown).toEqual([]);
    expect(report.known.map((k) => k.name).sort()).toEqual(
      ["HARDKAS_DEV_SERVER_AUTOSIGN", "HARDKAS_DEV_SERVER_URL", "HARDKAS_EXPERIMENTAL_L2", "IGRA_RPC_URL"].sort()
    );
  });

  it("unit · a misspelt HARDKAS_DEV_SERVER_* variable is unknown (the prefix is no longer exempt)", () => {
    const report = checkEnvironment({ HARDKAS_DEV_SERVER_AUTOSING: "1" }, null);
    expect(report.unknown).toEqual(["HARDKAS_DEV_SERVER_AUTOSING"]);
    // the other exempt prefixes are unchanged
    expect(checkEnvironment({ HARDKAS_TEST_X: "1", HARDKAS_HARNESS_X: "1", HARDKAS_ESCROW_STORE_PATH: "/x" }, null).unknown).toEqual([]);
  });

  it("unit · HARDKAS_DEV_SERVER_AUTOSIGN=1 is a policy warning; any other value is not", () => {
    const on = checkEnvironment({ HARDKAS_DEV_SERVER_AUTOSIGN: "1" }, null);
    expect(on.warnings.map((w) => w.name)).toEqual(["HARDKAS_DEV_SERVER_AUTOSIGN"]);
    // ESCALÓN 4 · P38: the warning says what the variable does now (local worlds only)
    expect(on.warnings[0]!.message).toMatch(/simulated ledger or a local simnet/);
    expect(on.warnings[0]!.message).not.toMatch(/non-mainnet|testnet-10 included/);
    expect(on.known[0]!.warning).toBe(on.warnings[0]!.message);
    expect(checkEnvironment({ HARDKAS_DEV_SERVER_AUTOSIGN: "0" }, null).warnings).toEqual([]);
  });

  it("unit · HARDKAS_EXPERIMENTAL_L2 is recognised as obsolete, and only it", () => {
    const report = checkEnvironment({ HARDKAS_EXPERIMENTAL_L2: "1", HARDKAS_HOME: "/h" }, null);
    const byName = Object.fromEntries(report.known.map((k) => [k.name, k]));
    expect(byName.HARDKAS_EXPERIMENTAL_L2).toMatchObject({ obsolete: true });
    expect(byName.HARDKAS_EXPERIMENTAL_L2!.meaning).toMatch(/^obsolete: .*extension/);
    expect(byName.HARDKAS_HOME!.obsolete).toBeUndefined();
    expect(report.warnings).toEqual([]);
  });

  it("unit · P34: HARDKAS_NETWORK is described as set by `test` and `run`, not as a dev-server switch", () => {
    expect(meaningOf("HARDKAS_NETWORK")).toMatch(/hardkas test and hardkas run/);
    expect(meaningOf("HARDKAS_NETWORK")).not.toMatch(/dev server/);
  });

  it("e2e · `env check --json` flags a misspelt dev-server variable (ENV_UNKNOWN_VARIABLE, exit 2)", () => {
    const r = envCheck(["env", "check", "--json"], { HARDKAS_DEV_SERVER_AUTOSING: "1" });
    expect(r.status, r.all).toBe(2);
    const out = JSON.parse(r.stdout.trim());
    expect(out).toMatchObject({ ok: false, code: "ENV_UNKNOWN_VARIABLE" });
    expect(out.result.unknown).toEqual(["HARDKAS_DEV_SERVER_AUTOSING"]);
  });

  it("e2e · the human `env check` warns on autosign and on the obsolete switch, and redacts URL credentials", () => {
    const r = envCheck(["env", "check"], {
      HARDKAS_DEV_SERVER_AUTOSIGN: "1",
      HARDKAS_EXPERIMENTAL_L2: "1",
      IGRA_RPC_URL: "http://user:p33secret@127.0.0.1:9/rpc"
    });
    expect(r.status, r.all).toBe(0);
    expect(r.all).toMatch(/⚠️ HARDKAS_DEV_SERVER_AUTOSIGN=1/);
    expect(r.all).toMatch(/⚠️ HARDKAS_EXPERIMENTAL_L2=1 .*obsolete/);
    expect(r.all).toMatch(/✅ IGRA_RPC_URL=/);
    expect(r.all).not.toContain("p33secret");
  });
});
