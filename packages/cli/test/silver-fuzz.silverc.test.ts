import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// Control 3 · `silver fuzz` through the built CLI. Its options are checked before anything runs; it refuses a contract
// its counter oracle does not fit; SYNTHETIC judges the structural compute-budget bounds in both directions; SCRIPT_VM
// judges the counter rule in both directions, so a VM that rejects everything — which the old command reported as FUZZ
// PASS at its default seed — and one that accepts everything both fail; a runner that gives no verdict is a toolchain
// failure started once, never a FUZZ FAIL; and the default policy never starts an UNVERIFIED runner.
// silverc level: the commands compile with the pinned silverc. The "VM" is a protocol-conformant node stand-in started
// in place of HARDKAS_SILVER_RUNNER by a test preload (fixtures/silver-runner-stand-in.cjs).
// -----------------------------------------------------------------------------

const OWNED = path.join(repoRoot, "examples", "09-silver-reference", "contracts", "owned-counter.sil");
const MATRIX = path.join(repoRoot, "packages", "accounts", "test", "fixtures", "v1-engine", "phase2", "terminable.sil");
const STAND_IN_PRELOAD = path.join(__dirname, "fixtures", "silver-runner-stand-in.cjs").split(path.sep).join("/");
let ws = "";
let runnerFile = "";
const standIns: Record<string, string> = {};

function documents(stdout: string): any[] {
  const out: any[] = [];
  for (const chunk of stdout.split(/\r?\n(?=[{[])/)) {
    try {
      out.push(JSON.parse(chunk.trim()));
    } catch {
      /* not a document */
    }
  }
  return out;
}

async function run(args: string[], standIn?: string) {
  const startsFile = path.join(ws, `starts-${Math.random().toString(16).slice(2)}.log`);
  const env = hermeticChildEnv(path.join(ws, "net.log"), {
    NO_COLOR: "1",
    ...(standIn
      ? { HARDKAS_SILVER_RUNNER: runnerFile, HK_TEST_RUNNER_REDIRECT: runnerFile, HK_TEST_RUNNER_STAND_IN: standIns[standIn]!, HK_TEST_RUNNER_STARTS: startsFile }
      : {})
  });
  delete env.HARDKAS_SILVER_RUNNER_TRUST;
  if (!standIn) delete env.HARDKAS_SILVER_RUNNER;
  if (standIn) env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require="${STAND_IN_PRELOAD}"`.trim();
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  const starts = fs.existsSync(startsFile) ? fs.readFileSync(startsFile, "utf8").split("\n").filter(Boolean).length : 0;
  return {
    exit: r.status,
    docs: documents(r.stdout),
    text: `${r.stdout}\n${r.stderr}`,
    starts,
    brief: `exit ${r.status}\n${r.stdout.slice(0, 1500)}\n${r.stderr.slice(0, 800)}`
  };
}
const report = (r: { docs: any[] }) => r.docs.find((d) => d?.schema === "hardkas.covenant.fuzz.report.v1");
const fuzz = (...extra: string[]) => ["silver", "fuzz", OWNED, "--entry", "bump", ...extra, "--json"];

beforeAll(() => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-silver-fuzz-cli-"));
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };\n');
  runnerFile = path.join(ws, process.platform === "win32" ? "cli-debugger.exe" : "cli-debugger");
  // on POSIX a runner file is startable only as an executable script or binary (R-01): the preload still answers for it
  const note = "the runner path the CLI resolves; a test preload starts a node stand-in in its place\n";
  fs.writeFileSync(runnerFile, process.platform === "win32" ? note : `#!/bin/sh\n# ${note}`);
  if (process.platform !== "win32") fs.chmodSync(runnerFile, 0o755);
  const write = (name: string, stdout: string, stderr: string, code: number) => {
    standIns[name] = path.join(ws, `${name}.mjs`);
    fs.writeFileSync(standIns[name]!, `process.stdout.write(${JSON.stringify(stdout)});\nprocess.stderr.write(${JSON.stringify(stderr)});\nprocess.exitCode = ${code};\n`);
  };
  write("reject", "", "error: script ran, but verification failed\n   --> 14:9\n   |\n14 |         require(delta > 0);\n   |\n\nError: \"FAIL\"\n", 1);
  write("accept", "PASS\n", "", 0);
  write("garbage", "laptop\\someone\n", "", 0);
});
afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

describe("Control 3 · silver fuzz checks what it is asked before running anything", () => {
  it("CF1 --runs, --seed and --backend out of range or malformed: SILVER_OPTION_INVALID, exit 2", async () => {
    for (const bad of [["--runs", "0"], ["--runs", "abc"], ["--runs", "10001"], ["--seed", "1.5"], ["--seed", "99999999999"], ["--backend", "CONSENSUS"]]) {
      const r = await run(fuzz(...bad));
      expect(r.exit, `${bad.join(" ")}\n${r.brief}`).toBe(2);
      expect(r.text).toContain("SILVER_OPTION_INVALID");
    }
  });

  it("CF2 a contract the counter oracle does not fit: SILVER_FUZZ_SHAPE_UNSUPPORTED, exit 2, before any sample", async () => {
    const r = await run(["silver", "fuzz", MATRIX, "--entry", "step", "--backend", "SYNTHETIC", "--json"]);
    expect(r.exit, r.brief).toBe(2);
    expect(r.text).toContain("SILVER_FUZZ_SHAPE_UNSUPPORTED");
    expect(report(r)).toBeUndefined();
  });
});

describe("Control 3 · silver fuzz judges both directions", () => {
  it("CF3 SYNTHETIC: structural compute-budget bounds, PASS, both directions counted, exit 0", async () => {
    const r = await run(fuzz("--backend", "SYNTHETIC", "--runs", "12"));
    expect(r.exit, r.brief).toBe(0);
    const rep = report(r);
    expect(rep).toMatchObject({ passed: true, outcome: "PASS", mode: "BIDIRECTIONAL", backend: "SYNTHETIC" });
    expect(rep.coverage.expectedAccept).toBeGreaterThanOrEqual(2);
    expect(rep.coverage.expectedReject).toBeGreaterThanOrEqual(3);
    expect(rep.oracle).toMatch(/^structural compute-budget bounds/);
  });

  it("CF4 SCRIPT_VM, a VM that rejects everything (the old command's FUZZ PASS): SILVER_FUZZ_FAILED, exit 1, the legitimate sample named", async () => {
    const r = await run(fuzz("--allow-unverified-runner"), "reject");
    expect(r.exit, r.brief).toBe(1);
    const rep = report(r);
    expect(rep).toMatchObject({ passed: false, outcome: "COUNTEREXAMPLE" });
    expect(rep.failure.error).toMatch(/^expected ACCEPT, observed REJECTED by the VM at line 14/);
    expect(rep.runner?.trust).toBe("UNVERIFIED");
    expect(rep.runnerWarning).toMatch(/UNVERIFIED/);
    expect(r.starts).toBeGreaterThanOrEqual(1);
  });

  it("CF5 SCRIPT_VM, a VM that accepts everything: SILVER_FUZZ_FAILED, exit 1, the illegitimate sample named", async () => {
    const r = await run(fuzz("--allow-unverified-runner"), "accept");
    expect(r.exit, r.brief).toBe(1);
    expect(report(r)?.failure?.error).toMatch(/^expected REJECT, observed ACCEPTED/);
  });
});

describe("Control 3 · silver fuzz never turns a runner failure into a verdict", () => {
  it("CF6 a program that is not the runner: SILVER_RUNNER_PROTOCOL_ERROR, exit 1, started once, never SILVER_FUZZ_FAILED", async () => {
    const r = await run(fuzz("--allow-unverified-runner"), "garbage");
    expect(r.exit, r.brief).toBe(1);
    expect(r.text).toContain("SILVER_RUNNER_PROTOCOL_ERROR");
    expect(r.text).not.toContain("SILVER_FUZZ_FAILED");
    expect(r.starts).toBe(1);
  });

  it("CF7 without --allow-unverified-runner the UNVERIFIED runner never starts: SILVER_RUNNER_UNVERIFIED, exit 3", async () => {
    const r = await run(fuzz(), "accept");
    expect(r.exit, r.brief).toBe(3);
    expect(r.text).toContain("SILVER_RUNNER_UNVERIFIED");
    expect(r.starts).toBe(0);
  });
});
