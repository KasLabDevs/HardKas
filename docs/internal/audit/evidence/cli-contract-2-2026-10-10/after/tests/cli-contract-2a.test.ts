import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000 });

// -----------------------------------------------------------------------------
// CLI-CONTRACT-2A · TRUTHFULNESS · AFTER (2026-10-10). The three commands the reviewer put first say what happened:
//   A · `hardkas test`: the verdict comes from the runner's own results (collected / executed / passed / failed /
//       skipped), never from `every()` over an empty list; zero collected, zero executed and a failure are three typed
//       failures with exit 1; `--json` prints one document, the envelope, with the counts and the code inside it; the
//       runner's own JSON report is kept on disk in the run directory.
//   B · `dev tx send` never announces a submission it did not make: a usage error is a typed usage failure (exit 2);
//       a flow whose send step did not run is TX_SEND_NOT_EXECUTED (exit 1), no "Transaction submitted.", no receipt.
//   C · `tx plan` refuses an explicitly empty --from / --to / --amount (TX_PLAN_USAGE, exit 2, nothing planned) and
//       keeps the documented defaults for options that were omitted.
// Every CLI run is a real process on the built dist, in its own temp workspace, under the hermetic rules of the gate.
// -----------------------------------------------------------------------------

const SCAFFOLD_TARGETS =
  'targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }, localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } }';
const scaffold = `export default { execution: { default: "simulator", ${SCAFFOLD_TARGETS} }, network: { allowPublic: false } };\n`;

type Run = { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; all: string; docs: any[] };

function docsOf(s: string): any[] {
  return s
    .split(/\r?\n(?=[{\[])/)
    .map((c) => {
      try {
        return JSON.parse(c.trim());
      } catch {
        return undefined;
      }
    })
    .filter((d) => d !== undefined);
}

function run(args: string[], cwd: string, env: Record<string, string> = {}, input = ""): Run {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: childEnv(env), input, timeout: 200_000 });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  return { status: r.status, signal: r.signal, stdout, stderr, all: `${stdout}\n${stderr}`, docs: docsOf(stdout) };
}

const envelope = (r: Run) => r.docs.find((d) => d && typeof d === "object" && !Array.isArray(d) && "ok" in d);
const brief = (r: Run) => `exit ${r.status}${r.signal ? ` signal ${r.signal}` : ""}\nstdout: ${r.stdout.slice(0, 1500)}\nstderr: ${r.stderr.slice(0, 900)}`;

function makeWs(prefix: string, config: string = scaffold): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), config);
  return ws;
}
const rmWs = (ws: string | undefined) => {
  if (ws) fs.rmSync(ws, { recursive: true, force: true });
};
const writeTest = (ws: string, name: string, body: string) => {
  fs.mkdirSync(path.join(ws, "test"), { recursive: true });
  fs.writeFileSync(path.join(ws, "test", name), body);
};
function listArtifacts(ws: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(path.join(ws, ".hardkas", "artifacts"));
  return out;
}
const receiptsOf = (ws: string) => listArtifacts(ws).filter((p) => /receipt/i.test(p)).length;

const PASSING = 'import { test, expect } from "vitest";\ntest("passes", () => { expect(1).toBe(1); });\n';
const FAILING = 'import { test, expect } from "vitest";\ntest("fails", () => { expect(1).toBe(2); });\n';
const SKIPPED = 'import { test } from "vitest";\ntest.skip("later", () => {});\n';
const MIXED = 'import { test, expect } from "vitest";\ntest("passes", () => { expect(1).toBe(1); });\ntest.skip("later", () => {});\n';
const BROKEN = 'import { test } from "vitest";\ntest("never collected", () => {\n'; // cannot be parsed

// -----------------------------------------------------------------------------
describe("CLI-CONTRACT-2A · A · `hardkas test` says what ran", () => {
  let ws: string;
  beforeEach(() => {
    ws = makeWs("hk-cc2a-test-");
  });
  afterEach(() => rmWs(ws));

  const testsOf = (r: Run) => envelope(r)?.result?.tests;

  it("A1 · no test file: ok:false, NO_TESTS_FOUND inside the one envelope, exit 1, nothing collected", () => {
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect({ docs: r.docs.length, exit: r.status, ok: e?.ok, code: e?.code, verdict: e?.result?.verdict, collected: testsOf(r)?.collected }, brief(r)).toEqual({
      docs: 1,
      exit: 1,
      ok: false,
      code: "NO_TESTS_FOUND",
      verdict: "NO_TESTS_FOUND",
      collected: 0
    });
    expect(e?.message, brief(r)).toMatch(/not a pass/);
  });

  it("A2 · one passing test: ok:true, exit 0, one document, the counts, and the runner's own report on disk agrees", () => {
    writeTest(ws, "pass.test.ts", PASSING);
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect({ docs: r.docs.length, exit: r.status, ok: e?.ok, verdict: e?.result?.verdict, tests: testsOf(r) }, brief(r)).toEqual({
      docs: 1,
      exit: 0,
      ok: true,
      verdict: "PASS",
      tests: { collected: 1, executed: 1, passed: 1, failed: 0, skipped: 0, todo: 0 }
    });
    expect(e?.result?.files, brief(r)).toEqual({ total: 1, failed: 0 });
    // the runner's JSON report went to the run directory, not to stdout, and says the same
    const reportPath = path.join(ws, e.result.vitestReport);
    expect(fs.existsSync(reportPath), `vitestReport ${e.result.vitestReport}`).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    expect({ total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, success: report.success }).toEqual({ total: 1, passed: 1, failed: 0, success: true });
    expect(fs.existsSync(path.join(ws, ".hardkas", "runs", e.result.testRunId, "test-results.json"))).toBe(true);
  });

  it("A3 · only a skipped test: ok:false, NO_TESTS_EXECUTED (not TESTS_FAILED), exit 1, 1 skipped, 0 failed", () => {
    writeTest(ws, "skip.test.ts", SKIPPED);
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect({ docs: r.docs.length, exit: r.status, ok: e?.ok, code: e?.code, tests: testsOf(r) }, brief(r)).toEqual({
      docs: 1,
      exit: 1,
      ok: false,
      code: "NO_TESTS_EXECUTED",
      tests: { collected: 1, executed: 0, passed: 0, failed: 0, skipped: 1, todo: 0 }
    });
  });

  it("A4 · `--scenario` that matches nothing: NO_TESTS_EXECUTED naming the pattern, exit 1", () => {
    writeTest(ws, "pass.test.ts", PASSING);
    const r = run(["test", "--json", "--scenario", "ZZZ_NO_SUCH_TEST"], ws);
    const e = envelope(r);
    expect({ exit: r.status, ok: e?.ok, code: e?.code, executed: testsOf(r)?.executed }, brief(r)).toEqual({ exit: 1, ok: false, code: "NO_TESTS_EXECUTED", executed: 0 });
    expect(e?.message, brief(r)).toMatch(/ZZZ_NO_SUCH_TEST/);
  });

  it("A5 · one passing and one skipped test: a pass (executed 1, skipped 1)", () => {
    writeTest(ws, "mixed.test.ts", MIXED);
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect({ exit: r.status, ok: e?.ok, tests: testsOf(r) }, brief(r)).toEqual({
      exit: 0,
      ok: true,
      tests: { collected: 2, executed: 1, passed: 1, failed: 0, skipped: 1, todo: 0 }
    });
  });

  it("A6 · a failing test: ok:false, TESTS_FAILED inside the envelope, exit 1, 1 failed of 1 executed", () => {
    writeTest(ws, "fail.test.ts", FAILING);
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect({ docs: r.docs.length, exit: r.status, ok: e?.ok, code: e?.code, tests: testsOf(r) }, brief(r)).toEqual({
      docs: 1,
      exit: 1,
      ok: false,
      code: "TESTS_FAILED",
      tests: { collected: 1, executed: 1, passed: 0, failed: 1, skipped: 0, todo: 0 }
    });
    expect(e?.message, brief(r)).toMatch(/1 of 1 executed test\(s\) failed/);
  });

  it("A7 · a test file that cannot run: ok:false, TESTS_FAILED, files.failed 1", () => {
    writeTest(ws, "broken.test.ts", BROKEN);
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect({ exit: r.status, ok: e?.ok, code: e?.code, filesFailed: e?.result?.files?.failed }, brief(r)).toEqual({ exit: 1, ok: false, code: "TESTS_FAILED", filesFailed: 1 });
    expect(e?.message, brief(r)).toMatch(/could not run/);
  });

  it("A8 · human mode: no JSON on stdout, the counts line, and the same exit codes (a pass is 0, no tests is 1)", () => {
    writeTest(ws, "pass.test.ts", PASSING);
    const pass = run(["test"], ws);
    expect({ exit: pass.status, docs: pass.docs.length, counts: /Tests: 1 collected, 1 passed, 0 failed, 0 skipped/.test(pass.all), success: /All executed tests passed/.test(pass.all) }, brief(pass)).toEqual({ exit: 0, docs: 0, counts: true, success: true });
    fs.rmSync(path.join(ws, "test"), { recursive: true, force: true });
    const none = run(["test"], ws);
    expect({ exit: none.status, docs: none.docs.length, typed: /\[NO_TESTS_FOUND\]/.test(none.all), falseSuccess: /All executed tests passed|Scenario execution completed!/.test(none.all) }, brief(none)).toEqual({ exit: 1, docs: 0, typed: true, falseSuccess: false });
  });
});

// -----------------------------------------------------------------------------
describe("CLI-CONTRACT-2A · B · `dev tx send` never announces a send it did not make", () => {
  let ws: string;
  beforeEach(() => {
    ws = makeWs("hk-cc2a-devtx-");
  });
  afterEach(() => rmWs(ws));

  it("B1 · without arguments: a typed usage failure, exit 2, no 'Transaction submitted'", () => {
    const r = run(["dev", "tx", "send"], ws);
    expect({ exit: r.status, typed: /\[TX_SEND_USAGE\]/.test(r.all), usage: /--from <alias> --to <address> --amount <kas>/.test(r.all), claimed: /Transaction submitted/.test(r.all) }, brief(r)).toEqual({
      exit: 2,
      typed: true,
      usage: true,
      claimed: false
    });
  });

  it("B2 · with arguments: the flow's send step does not run (no consent), so TX_SEND_NOT_EXECUTED, exit 1, no claim, no receipt", () => {
    const r = run(["dev", "tx", "send", "--from", "alice", "--to", "bob", "--amount", "1"], ws);
    expect(
      { exit: r.status, typed: /\[TX_SEND_NOT_EXECUTED\]/.test(r.all), reason: /did not broadcast/.test(r.all) && /--yes is required to broadcast/.test(r.all), claimed: /Transaction submitted/.test(r.all), receipts: receiptsOf(ws) },
      brief(r)
    ).toEqual({ exit: 1, typed: true, reason: true, claimed: false, receipts: 0 });
  });
});

// -----------------------------------------------------------------------------
describe("CLI-CONTRACT-2A · C · `tx plan` refuses explicit empties and keeps omitted defaults", () => {
  let ws: string;
  beforeEach(() => {
    ws = makeWs("hk-cc2a-plan-");
  });
  afterEach(() => rmWs(ws));

  const plan = (args: string[]) => run(["tx", "plan", ...args, "--json"], ws);
  const refused = (r: Run, before: number) => ({
    exit: r.status,
    code: envelope(r)?.code,
    docs: r.docs.length,
    planned: /"planId"/.test(r.stdout),
    newArtifacts: listArtifacts(ws).length - before
  });

  it.each([
    ["--amount", ["--from", "alice", "--to", "bob", "--amount", ""]],
    ["--to", ["--from", "alice", "--to", "", "--amount", "1"]],
    ["--from", ["--from", "", "--to", "bob", "--amount", "1"]]
  ])("C1 · `%s \"\"`: TX_PLAN_USAGE, exit 2, one envelope, nothing planned or written", (_flag, args) => {
    const before = listArtifacts(ws).length;
    const r = plan(args as string[]);
    expect(refused(r, before), brief(r)).toEqual({ exit: 2, code: "TX_PLAN_USAGE", docs: 1, planned: false, newArtifacts: 0 });
    expect(envelope(r)?.message, brief(r)).toMatch(new RegExp(`${_flag} was given but empty`));
  });

  it("C2 · a blank value (`--amount \"  \"`) is empty too; two empties are named together", () => {
    const before = listArtifacts(ws).length;
    const blank = plan(["--from", "alice", "--to", "bob", "--amount", "  "]);
    expect(refused(blank, before), brief(blank)).toEqual({ exit: 2, code: "TX_PLAN_USAGE", docs: 1, planned: false, newArtifacts: 0 });
    const two = plan(["--from", "", "--to", "", "--amount", "1"]);
    expect({ exit: two.status, code: envelope(two)?.code, both: /--from, --to were given but empty/.test(envelope(two)?.message ?? "") }, brief(two)).toEqual({ exit: 2, code: "TX_PLAN_USAGE", both: true });
  });

  it("C3 · an empty positional (`tx plan \"\" bob`) is refused the same way", () => {
    const before = listArtifacts(ws).length;
    const r = plan(["", "bob", "--amount", "1"]);
    expect(refused(r, before), brief(r)).toEqual({ exit: 2, code: "TX_PLAN_USAGE", docs: 1, planned: false, newArtifacts: 0 });
  });

  it("C4 · control · omitted options keep their documented defaults: alice → bob, 1 KAS", () => {
    const r = plan([]);
    const a = r.docs[0];
    expect({ exit: r.status, from: a?.from?.input, to: a?.to?.input, amountSompi: a?.amountSompi }, brief(r)).toEqual({ exit: 0, from: "alice", to: "bob", amountSompi: "100000000" });
  });

  it("C5 · control · given values are used: `--amount 2` plans 2 KAS to bob", () => {
    const r = plan(["--from", "alice", "--to", "bob", "--amount", "2"]);
    const a = r.docs[0];
    expect({ exit: r.status, amountSompi: a?.amountSompi, to: a?.to?.input }, brief(r)).toEqual({ exit: 0, amountSompi: "200000000", to: "bob" });
  });
});
