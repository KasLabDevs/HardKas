import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// F3 (H-B4) · `hardkas silver test` follows the same runner trust policy as the dev-framework commands. A runner that is
// not VERIFIED (today every runner: upstream publishes no binary) runs only under the explicit opt-in
// (--allow-unverified-runner or HARDKAS_SILVER_RUNNER_TRUST=allow-unverified); otherwise exit 3, SILVER_RUNNER_UNVERIFIED.
// Its record says so (evidence unverified-vm-scenario, runner.trust UNVERIFIED), never "official". A program that answers
// without the runner's verdict is a runner error (SILVER_RUNNER_*), never a failed contract test.
// SilverScript runner level: the built CLI, silverc and HARDKAS_SILVER_RUNNER (a local cli-debugger build).
// -----------------------------------------------------------------------------

const GUESS = "pragma silverscript ^0.1.0;\n\ncontract Guess(int secret) {\n    entry open(int guess) {\n        require(guess == secret);\n    }\n}\n";
const oneOut = { version: 0, inputs: [{ utxo_value: 1_000_000_000, sig_op_count: 1, sequence: 0 }], outputs: [{ value: 900_000_000, script_hex: `20${"11".repeat(32)}ac` }] };
const made: string[] = [];
let ws = "";
const runner = process.env.HARDKAS_SILVER_RUNNER ?? "";

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

async function run(args: string[], env: { trust?: string } = {}) {
  const log = path.join(ws, "net.log");
  const childEnv = hermeticChildEnv(log, { NO_COLOR: "1" });
  // the runner level opts in for its own processes: each case decides the trust for the CLI it starts
  delete childEnv.HARDKAS_SILVER_RUNNER_TRUST;
  if (env.trust) childEnv.HARDKAS_SILVER_RUNNER_TRUST = env.trust;
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env: childEnv });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  const docs = documents(r.stdout);
  return {
    exit: r.status,
    record: docs.find((d) => d?.schema === "hardkas.silverVmTest.v1"),
    error: docs.find((d) => d?.ok === false),
    brief: `exit ${r.status}\n${r.stdout.slice(0, 1500)}\n${r.stderr.slice(0, 800)}`
  };
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  expect(runner, "HARDKAS_SILVER_RUNNER names the runner").not.toBe("");
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-silver-test-trust-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };\n');
  fs.writeFileSync(path.join(ws, "guess.sil"), GUESS);
  fs.writeFileSync(path.join(ws, "args.json"), '[{"kind":"int","value":42}]');
  fs.writeFileSync(path.join(ws, "pass.test.json"), JSON.stringify({ tests: [{ name: "right", function: "open", args: ["42"], expect: "pass", tx: oneOut }, { name: "wrong-expected", function: "open", args: ["41"], expect: "fail", tx: oneOut }] }));
  fs.writeFileSync(path.join(ws, "fail.test.json"), JSON.stringify({ tests: [{ name: "wrong", function: "open", args: ["41"], expect: "pass", tx: oneOut }] }));
  fs.copyFileSync(process.execPath, path.join(ws, process.platform === "win32" ? "not-a-runner.exe" : "not-a-runner"));
  const compiled = await run(["silver", "compile", "guess.sil", "--args", "args.json", "--out", "guess.record.json", "--json"]);
  expect(compiled.exit, compiled.brief).toBe(0);
});
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const testArgs = (tests: string, runnerPath = runner) => ["silver", "test", "guess.record.json", "--args", "args.json", "--tests", tests, "--runner", runnerPath, "--json"];

describe("F3 · silver test applies the runner trust policy", () => {
  it("T1 an UNVERIFIED runner without the opt-in is never executed: SILVER_RUNNER_UNVERIFIED, exit 3, no record", async () => {
    const r = await run(testArgs("pass.test.json"));
    expect(r.exit, r.brief).toBe(3);
    expect(r.error?.code, r.brief).toBe("SILVER_RUNNER_UNVERIFIED");
    expect(r.record).toBeUndefined();
  });

  it("T2 with --allow-unverified-runner it runs, and the record says UNVERIFIED, never official", async () => {
    const r = await run([...testArgs("pass.test.json"), "--allow-unverified-runner"]);
    expect(r.exit, r.brief).toBe(0);
    expect(r.record?.evidence, r.brief).toBe("unverified-vm-scenario");
    expect(r.record?.runner?.trust, r.brief).toBe("UNVERIFIED");
    expect(r.record?.scope, r.brief).not.toMatch(/^Official/);
    expect(r.record?.results?.map((x: any) => [x.name, x.outcome]), r.brief).toEqual([["right", "PASS"], ["wrong-expected", "PASS"]]);
  });

  it("T3 the environment opt-in (HARDKAS_SILVER_RUNNER_TRUST=allow-unverified) is the same opt-in", async () => {
    const r = await run(testArgs("pass.test.json"), { trust: "allow-unverified" });
    expect(r.exit, r.brief).toBe(0);
    expect(r.record?.evidence, r.brief).toBe("unverified-vm-scenario");
  });

  it("T4 a program that is not the runner gives no verdict: SILVER_RUNNER_*, exit 1, never a failed contract test", async () => {
    const r = await run([...testArgs("pass.test.json", path.join(ws, process.platform === "win32" ? "not-a-runner.exe" : "not-a-runner")), "--allow-unverified-runner"]);
    expect(r.exit, r.brief).toBe(1);
    expect(r.error?.code, r.brief).toMatch(/^SILVER_RUNNER_(PROTOCOL_ERROR|INTERNAL_ERROR|OUTPUT_UNRECOGNIZED)$/);
    expect(r.error?.code, r.brief).not.toBe("SILVER_TEST_FAILED");
  });

  it("T5 control: a genuinely failing test is a failed contract test (SILVER_TEST_FAILED), exit 1", async () => {
    const r = await run([...testArgs("fail.test.json"), "--allow-unverified-runner"]);
    expect(r.exit, r.brief).toBe(1);
    expect(r.record?.results?.[0]?.outcome, r.brief).toBe("FAIL");
    expect(r.error?.code ?? "", r.brief).not.toMatch(/^SILVER_RUNNER_/);
  });
});
