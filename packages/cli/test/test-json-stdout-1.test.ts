import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000 });

// -----------------------------------------------------------------------------
// TEST-JSON-STDOUT-1 (2026-10-21). Found by the security audit of 2026-10-21 (SA-3): `hardkas test --json` printed vitest's
// own line "JSON report written to <path>" on stdout before the envelope, so `JSON.parse(stdout)` failed — the
// machine-readable answer was not machine-readable. (CLI-CONTRACT-2 A2a counts the JSON documents on stdout and so did
// not see a line that is not one.) Contract: under --json, stdout is exactly the envelope; the test engine's own
// messages go to stderr. Same for --evidence. Every run is a real process on the built dist, in its own workspace.
// -----------------------------------------------------------------------------

const scaffold =
  'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n';
const PASSING = 'import { test, expect } from "vitest";\ntest("passes", () => { expect(1).toBe(1); });\n';

function run(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: childEnv({}), timeout: 200_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
const brief = (r: { status: number | null; stdout: string; stderr: string }) => `exit ${r.status}\nstdout: ${r.stdout.slice(0, 1500)}\nstderr: ${r.stderr.slice(0, 900)}`;
function parsesWhole(stdout: string): { ok: true; doc: any } | { ok: false; error: string } {
  try {
    return { ok: true, doc: JSON.parse(stdout) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

describe("TEST-JSON-STDOUT-1 · `hardkas test --json` answers with exactly one JSON document on stdout", () => {
  let ws: string;
  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tjs1-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), scaffold);
    fs.mkdirSync(path.join(ws, "test"));
    fs.writeFileSync(path.join(ws, "test", "pass.test.ts"), PASSING);
  });
  afterEach(() => fs.rmSync(ws, { recursive: true, force: true }));

  for (const args of [["test", "--json"], ["test", "--evidence", "--json"]]) {
    it(`\`hardkas ${args.join(" ")}\`: the whole of stdout parses as the envelope (ok, exit 0); the engine's report line is not on stdout`, () => {
      const r = run(args, ws);
      const parsed = parsesWhole(r.stdout);
      expect(parsed.ok, `${brief(r)}\n${(parsed as any).error ?? ""}`).toBe(true);
      expect({ exit: r.status, ok: (parsed as any).doc?.ok }, brief(r)).toEqual({ exit: 0, ok: true });
      expect(r.stdout, brief(r)).not.toMatch(/JSON report written/i);
    });
  }
});
