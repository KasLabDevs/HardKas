import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000 });

// -----------------------------------------------------------------------------
// CLI-CONTRACT-2 · BEFORE (2026-10-10, on the published 3c61d15f6). Investigation only: each case states the contract
// the reviewer asked to check and records what the published CLI does today. A red case is a live defect; a green one
// is a control, or a historical finding already fixed. Nothing here changes the product.
//   A · the `hardkas test` verdict (TEST-VACUOUS-PASS): a pass proves something ran; the envelope and the exit code
//       agree; one JSON document on stdout; a run with no failure is never TESTS_FAILED; the report names the world
//       the tests ran in.
//   B · one unreachable node, one typed code: `tx plan`, `accounts balance`, `rpc health` on a node that refuses.
//   C · an error shown is a failure of the run (exit ≠ 0); a claim in the output is backed by an effect.
//   D · `--json` always answers with exactly one envelope, usage errors included, with the usage exit code (2).
//   E · an explicit empty input is refused, never replaced by a default.
// Every CLI run is a real process on the built dist, in its own temp workspace, under the hermetic rules of the gate
// (any non-loopback connection is refused; the localnet node is never there, so a node-bound command fails there).
// -----------------------------------------------------------------------------

const SCAFFOLD_TARGETS =
  'targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }, localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } }';
const scaffold = `export default { execution: { default: "simulator", ${SCAFFOLD_TARGETS} }, network: { allowPublic: false } };\n`;
const localnetDefault = `export default { execution: { default: "localnet", ${SCAFFOLD_TARGETS} }, network: { allowPublic: false } };\n`;
const DOCKER_DOWN = { DOCKER_HOST: "tcp://127.0.0.1:1" };

type Run = { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; all: string; docs: any[] };

/** Every JSON document a command printed on stdout (one per block that starts a line with `{` or `[`). */
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
const codeOf = (r: Run): string | null => {
  const e = envelope(r);
  return e?.code ?? e?.error?.code ?? null;
};
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
function listReceipts(ws: string): number {
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
  return out.filter((p) => /receipt/i.test(p)).length;
}
/** How many tests the envelope says ran: today's report has no test counts, only scenario-result files. */
const testsReported = (e: any): number =>
  Number(e?.result?.scenariosExecuted ?? 0) +
  Number(e?.result?.tests?.passed ?? e?.result?.testsPassed ?? e?.result?.numPassedTests ?? 0) +
  Number(e?.result?.tests?.failed ?? e?.result?.testsFailed ?? e?.result?.numFailedTests ?? 0);

const PASSING = 'import { test, expect } from "vitest";\ntest("passes", () => { expect(1).toBe(1); });\n';
const FAILING = 'import { test, expect } from "vitest";\ntest("fails", () => { expect(1).toBe(2); });\n';
const SKIPPED = 'import { test } from "vitest";\ntest.skip("later", () => {});\n';

// -----------------------------------------------------------------------------
describe("CLI-CONTRACT-2 · A · the `hardkas test` verdict (TEST-VACUOUS-PASS)", () => {
  let ws: string;
  beforeEach(() => {
    ws = makeWs("hk-cc2-test-");
  });
  afterEach(() => rmWs(ws));

  it("A1 · no test file: zero tests run is not a pass, and the envelope agrees with the exit code", () => {
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect(e, brief(r)).toBeDefined();
    expect(
      { envelopeAgreesWithExit: (e.ok === true) === (r.status === 0), passWithNothingRun: e.ok === true && testsReported(e) === 0 },
      brief(r)
    ).toEqual({ envelopeAgreesWithExit: true, passWithNothingRun: false });
  });

  it("A2a · one passing test under --json: exactly one JSON document on stdout (the envelope), exit 0, ok:true", () => {
    writeTest(ws, "pass.test.ts", PASSING);
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect({ exit: r.status, ok: e?.ok, documents: r.docs.length }, brief(r)).toEqual({ exit: 0, ok: true, documents: 1 });
  });

  it("A2b · one passing test: the report says how many tests ran (a pass that proves something ran)", () => {
    writeTest(ws, "pass.test.ts", PASSING);
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect(e?.ok, brief(r)).toBe(true);
    expect(testsReported(e), `the envelope: ${JSON.stringify(e)}`).toBeGreaterThan(0);
  });

  it("A3 · a file whose only test is skipped: nothing failed, so the verdict is never TESTS_FAILED", () => {
    writeTest(ws, "skip.test.ts", SKIPPED);
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect({ code: codeOf(r), claimsFailure: e?.ok === false }, brief(r)).toEqual({ code: null, claimsFailure: false });
  });

  it("A4 · `--scenario` that matches no test: zero tests selected is neither a pass nor TESTS_FAILED, and the envelope agrees with the exit", () => {
    writeTest(ws, "pass.test.ts", PASSING);
    const r = run(["test", "--json", "--scenario", "ZZZ_NO_SUCH_TEST"], ws);
    const e = envelope(r);
    expect(e, brief(r)).toBeDefined();
    expect(
      {
        envelopeAgreesWithExit: (e.ok === true) === (r.status === 0),
        passWithNothingRun: e.ok === true && testsReported(e) === 0,
        reportedAsTestFailure: codeOf(r) === "TESTS_FAILED"
      },
      brief(r)
    ).toEqual({ envelopeAgreesWithExit: true, passWithNothingRun: false, reportedAsTestFailure: false });
  });

  it("A5 · control · a failing test: ok:false, TESTS_FAILED, exit 1", () => {
    writeTest(ws, "fail.test.ts", FAILING);
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect({ exit: r.status, ok: e?.ok, code: codeOf(r) }, brief(r)).toEqual({ exit: 1, ok: false, code: "TESTS_FAILED" });
  });

  it("A6 · the report names the world the tests ran in (this workspace executes in the simulator), not an option default", () => {
    writeTest(ws, "pass.test.ts", PASSING);
    const r = run(["test", "--json"], ws);
    const e = envelope(r);
    expect(e?.result?.network, brief(r)).toBe("simulated");
  });
});

// -----------------------------------------------------------------------------
describe("CLI-CONTRACT-2 · B · one unreachable node, one typed code", () => {
  let ws: string;
  const UNTYPED = /^UNKNOWN(_ERROR)?$/;
  beforeEach(() => {
    ws = makeWs("hk-cc2-node-", localnetDefault);
  });
  afterEach(() => rmWs(ws));

  it("B0 · control · a typed refusal before any connection: `--network nonsense` is UNKNOWN_NETWORK in one envelope", () => {
    const r = run(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "nonsense", "--json"], ws);
    expect({ exit: r.status, code: codeOf(r), docs: r.docs.length }, brief(r)).toEqual({ exit: 1, code: "UNKNOWN_NETWORK", docs: 1 });
  });

  it("B1 · `tx plan --json` against a node that refuses: a typed connection code, never UNKNOWN", () => {
    const r = run(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], ws);
    expect(r.status, brief(r)).not.toBe(0);
    expect(codeOf(r), brief(r)).not.toBeNull();
    expect(codeOf(r), brief(r)).not.toMatch(UNTYPED);
  });

  it("B2 · `accounts balance alice --json` against the same node: typed, never UNKNOWN_ERROR", () => {
    const r = run(["accounts", "balance", "alice", "--json"], ws);
    expect(r.status, brief(r)).not.toBe(0);
    expect(codeOf(r), brief(r)).not.toBeNull();
    expect(codeOf(r), brief(r)).not.toMatch(UNTYPED);
  });

  it("B3 · control · `rpc health --json` against the same node: typed", () => {
    const r = run(["rpc", "health", "--json"], ws);
    expect(r.status, brief(r)).not.toBe(0);
    expect(codeOf(r), brief(r)).not.toBeNull();
    expect(codeOf(r), brief(r)).not.toMatch(UNTYPED);
  });

  it("B4 · the three commands name one failure (the node refuses) with one code", () => {
    const codes = [
      run(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], ws),
      run(["accounts", "balance", "alice", "--json"], ws),
      run(["rpc", "health", "--json"], ws)
    ].map((r) => codeOf(r) ?? "(none)");
    expect(new Set(codes).size, `tx plan / accounts balance / rpc health → ${codes.join(" / ")}`).toBe(1);
  });
});

// -----------------------------------------------------------------------------
describe("CLI-CONTRACT-2 · C · an error shown is a failure of the run; a claim is backed by an effect", () => {
  let ws: string;
  beforeEach(() => {
    ws = makeWs("hk-cc2-claims-");
  });
  afterEach(() => rmWs(ws));

  it("C1 · `dev tx send` without arguments: the usage error it prints is exit ≠ 0", () => {
    const r = run(["dev", "tx", "send"], ws);
    expect(r.all, brief(r)).toMatch(/Missing required arguments/);
    expect(r.status, brief(r)).not.toBe(0);
  });

  it("C2 · `dev tx send` follows the workspace's execution target (the simulator here), never a hard-coded simnet node", () => {
    const r = run(["dev", "tx", "send", "--from", "alice", "--to", "bob", "--amount", "1"], ws);
    const claimed = /Transaction submitted/.test(r.stdout);
    expect(
      { wentToTheLocalnetNode: /18210|simnet/.test(r.all), claimWithoutReceipt: claimed && listReceipts(ws) === 0 },
      brief(r)
    ).toEqual({ wentToTheLocalnetNode: false, claimWithoutReceipt: false });
  });

  it("C3 · `create <unknown template> <dest> --json`: exit ≠ 0 and the CLI's one envelope shape ({ ok:false, code })", () => {
    const r = run(["create", "no-such-template", "dest-dir", "--json"], ws);
    const e = envelope(r);
    expect({ failed: r.status !== 0, topLevelCode: typeof e?.code === "string" }, brief(r)).toEqual({ failed: true, topLevelCode: true });
  });

  it("C4 · `status` reports a hardkas.config.ts that cannot load, instead of describing the workspace as if nothing were wrong", () => {
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'throw new Error("this config cannot load");\n');
    const r = run(["status"], ws);
    expect(r.status !== 0 || /config/i.test(r.all), brief(r)).toBe(true);
  });

  it("C4b · `status` in a directory that holds a hardkas.config.ts but no .hardkas/ does not call it 'no workspace' (WA-1: the config is the root)", () => {
    fs.rmSync(path.join(ws, ".hardkas"), { recursive: true, force: true });
    const r = run(["status"], ws);
    expect(r.all, brief(r)).not.toMatch(/No HardKAS workspace detected/);
  });

  it("C5 · `ci verify` in a pristine simulator workspace when only Docker is down: no 'corrupted workspace' verdict", () => {
    const r = run(["ci", "verify"], ws, DOCKER_DOWN);
    if (r.status !== 0) expect(r.all, brief(r)).not.toMatch(/corrupted|incorrectly configured/i);
  });

  it("C6 · `doctor --json`: failed checks and the exit code agree (a verdict that reports failures does not exit 0)", () => {
    const r = run(["doctor", "--json"], ws, DOCKER_DOWN);
    const report = r.docs.find((d) => d?.summary || d?.result?.summary);
    const failed = Number(report?.summary?.failed ?? report?.result?.summary?.failed ?? 0);
    expect(report, brief(r)).toBeDefined();
    expect({ failedChecks: failed, exit: r.status }, brief(r)).toSatisfy((x: any) => (x.failedChecks > 0) === (x.exit !== 0));
  });

  it("C7 · re-sending an already applied signed transaction: the answer never reads as a fresh submission without saying it was already applied", () => {
    const plan = run(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--out", "p.json", "--json"], ws);
    expect(plan.status, brief(plan)).toBe(0);
    const sign = run(["tx", "sign", "p.json", "--out", "s.json", "--json"], ws);
    expect(sign.status, brief(sign)).toBe(0);
    const first = run(["tx", "send", "s.json", "--json"], ws);
    expect(first.status, brief(first)).toBe(0);
    const receiptsAfterFirst = listReceipts(ws);
    const second = run(["tx", "send", "s.json", "--json"], ws);
    const text = JSON.stringify(envelope(second) ?? second.docs[0] ?? {});
    expect(
      { receiptsAfterFirst, receiptsAfterSecond: listReceipts(ws), markedAsAlreadyApplied: second.status !== 0 || /already|idempotent|duplicate|applied|replay/i.test(text) },
      brief(second)
    ).toMatchObject({ markedAsAlreadyApplied: true });
  });
});

// -----------------------------------------------------------------------------
describe("CLI-CONTRACT-2 · D · `--json` answers with exactly one envelope, usage errors included", () => {
  let ws: string;
  beforeEach(() => {
    ws = makeWs("hk-cc2-json-");
  });
  afterEach(() => rmWs(ws));

  it("D1 · an unknown option under --json: one { ok:false } envelope on stdout and the usage exit code (2)", () => {
    const r = run(["tx", "plan", "--no-such-option", "--json"], ws);
    expect({ docs: r.docs.length, exit: r.status }, brief(r)).toEqual({ docs: 1, exit: 2 });
  });

  it("D2 · a missing required argument under --json (`artifact verify --json`): the same", () => {
    const r = run(["artifact", "verify", "--json"], ws);
    expect({ docs: r.docs.length, exit: r.status }, brief(r)).toEqual({ docs: 1, exit: 2 });
  });

  it("D3 · `run <missing file> --json`: one document, not two", () => {
    const r = run(["run", "no-such-script.ts", "--json"], ws);
    expect(r.docs.length, brief(r)).toBe(1);
  });

  it("D4 · `kaspa doctor --json`: one document, not two", () => {
    const r = run(["kaspa", "doctor", "--json"], ws);
    expect(r.docs.length, brief(r)).toBe(1);
  });

  it("D5 · control · `node reset --json` without --yes is a typed usage refusal with one envelope (JSON-ENVELOPE-RESIDUAL-2, fixed)", () => {
    const r = run(["node", "reset", "--json"], ws, DOCKER_DOWN);
    expect({ code: codeOf(r), exit: r.status, docs: r.docs.length }, brief(r)).toEqual({ code: "INTERACTIVE_PROMPT_IN_JSON_MODE", exit: 2, docs: 1 });
  });
});

// -----------------------------------------------------------------------------
describe("CLI-CONTRACT-2 · E · an explicit empty input is refused, never replaced by a default", () => {
  let ws: string;
  beforeEach(() => {
    ws = makeWs("hk-cc2-empty-");
  });
  afterEach(() => rmWs(ws));

  it.each([
    ["--amount", ["--from", "alice", "--to", "bob", "--amount", ""]],
    ["--to", ["--from", "alice", "--to", "", "--amount", "1"]],
    ["--from", ["--from", "", "--to", "bob", "--amount", "1"]]
  ])("E · `tx plan %s \"\"` is refused: exit ≠ 0 and no plan", (_flag, args) => {
    const r = run(["tx", "plan", ...(args as string[]), "--json"], ws);
    expect(r.status, brief(r)).not.toBe(0);
    expect(r.stdout, "no plan came out").not.toMatch(/"planId"/);
  });
});
