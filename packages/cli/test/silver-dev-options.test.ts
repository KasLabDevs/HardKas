import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv, repoRoot } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// Control 3 (R-14) · the dev-framework commands check their options before they compile or run anything, so these cases
// need neither silverc nor a runner (canonical level): an unknown --level, --backend, --runs or --seed is a usage error
// (exit 2, SILVER_OPTION_INVALID), never a silent fallback to another level or backend.
// -----------------------------------------------------------------------------

const OWNED = path.join(repoRoot, "examples", "09-silver-reference", "contracts", "owned-counter.sil");
let ws = "";
beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-silver-dev-options-"));
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };\n');
});
afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

const run = (args: string[]) => {
  const env = childEnv({ NO_COLOR: "1" });
  delete env.HARDKAS_SILVER_RUNNER;
  delete env.HARDKAS_SILVER_RUNNER_TRUST;
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, env, encoding: "utf8", timeout: 60_000 });
  return { exit: r.status, text: `${r.stdout}\n${r.stderr}` };
};

describe("Control 3 · dev-framework options are checked before anything runs", () => {
  it("OPT1 silver preflight --level that is not a preflight level: SILVER_OPTION_INVALID, exit 2", () => {
    for (const level of ["SCRIPT_VM", "structural_preflight", "CONSENSUS_SIMNET_PREFLIGHT", ""]) {
      const r = run(["silver", "preflight", OWNED, "--entry", "bump", "--demo-fixture", "--level", level, "--json"]);
      expect(r.exit, `${level}\n${r.text.slice(0, 600)}`).toBe(2);
      expect(r.text).toContain("SILVER_OPTION_INVALID");
    }
  });

  it("OPT2 silver fuzz --backend, --runs and --seed out of range: SILVER_OPTION_INVALID, exit 2", () => {
    for (const bad of [["--backend", "SIMNET"], ["--runs", "+5"], ["--runs", "1e3"], ["--seed", "2147483648"]]) {
      const r = run(["silver", "fuzz", OWNED, "--entry", "bump", ...bad, "--json"]);
      expect(r.exit, `${bad.join(" ")}\n${r.text.slice(0, 600)}`).toBe(2);
      expect(r.text).toContain("SILVER_OPTION_INVALID");
    }
  });
});
