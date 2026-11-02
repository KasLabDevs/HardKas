import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// R-05 · a runner that cannot run is a toolchain failure, never a contract verdict. With the explicit opt-in
// (--allow-unverified-runner) HARDKAS_SILVER_RUNNER names a file that is not an executable: `silver debug`, `silver
// preflight` and `silver fuzz` report RUNNER_START_FAILED (exit 1, SILVER_RUNNER_START_FAILED) — never REJECTED and never
// a FUZZ FAIL. silverc level: the commands compile with the pinned silverc; no runner needed.
// -----------------------------------------------------------------------------

const OWNED = path.join(repoRoot, "examples", "09-silver-reference", "contracts", "owned-counter.sil");
const made: string[] = [];
let ws = "";
let notExe = "";

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

async function run(args: string[]) {
  const log = path.join(ws, "net.log");
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env: hermeticChildEnv(log, { NO_COLOR: "1", HARDKAS_SILVER_RUNNER: notExe }) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  return { exit: r.status, docs: documents(r.stdout), text: `${r.stdout}\n${r.stderr}`, brief: `exit ${r.status}\n${r.stdout.slice(0, 1500)}\n${r.stderr.slice(0, 800)}` };
}

beforeAll(() => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-runner-outcome-cli-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };\n');
  notExe = path.join(ws, process.platform === "win32" ? "not-a-runner.exe" : "not-a-runner");
  fs.writeFileSync(notExe, "not an executable\n");
});
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("R-05 · a runner that does not start is never a contract rejection", () => {
  it("CO1 silver debug: RUNNER_START_FAILED, exit 1, verdict BLOCKED_BY_TOOLCHAIN (never REJECTED)", async () => {
    const r = await run(["silver", "debug", OWNED, "--entry", "bump", "--demo-fixture", "--allow-unverified-runner", "--json"]);
    expect(r.exit, r.brief).toBe(1);
    const report = r.docs.find((d) => d?.schema === "hardkas.silver.debugReport.v1");
    expect(report?.contractVerdict, r.brief).toBe("BLOCKED_BY_TOOLCHAIN");
    expect(report?.verdicts?.scriptVm).toMatchObject({ verdict: "BLOCKED", class: "RUNNER_START_FAILED" });
    expect(report?.runner?.trust).toBe("UNVERIFIED");
  });

  it("CO2 silver preflight: RUNNER_START_FAILED, exit 1, status BLOCKED (never PREFLIGHT FAIL as a rejection)", async () => {
    const r = await run(["silver", "preflight", OWNED, "--entry", "bump", "--demo-fixture", "--allow-unverified-runner", "--json"]);
    expect(r.exit, r.brief).toBe(1);
    const summary = r.docs.find((d) => d?.schema === "hardkas.silver.preflight.v1");
    expect(summary?.status, r.brief).toBe("BLOCKED");
    expect(summary?.vmOutcome).toBe("RUNNER_START_FAILED");
  });

  it("CO3 silver fuzz: SILVER_RUNNER_START_FAILED, never SILVER_FUZZ_FAILED", async () => {
    const r = await run(["silver", "fuzz", OWNED, "--entry", "bump", "--runs", "3", "--allow-unverified-runner", "--json"]);
    expect(r.exit, r.brief).toBe(1);
    expect(r.text).toContain("SILVER_RUNNER_START_FAILED");
    expect(r.text).not.toContain("SILVER_FUZZ_FAILED");
  });
});
