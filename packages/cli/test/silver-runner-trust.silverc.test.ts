import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// R-04 · `silver debug`, `silver preflight` and `silver fuzz` never take a verdict from an unverified runner unless the
// user opts in. HARDKAS_SILVER_RUNNER names a file that is not a runner: by default it is identified (path, SHA-256,
// UNVERIFIED) and never executed; the command is refused by policy (exit 3), the report names the runner it refused.
// silverc level: the commands compile the contract with the pinned silverc; no runner needed (none is executed).
// -----------------------------------------------------------------------------

const OWNED = path.join(repoRoot, "examples", "09-silver-reference", "contracts", "owned-counter.sil");
const made: string[] = [];
let ws = "";
let fake = "";

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

async function run(args: string[], extraEnv: Record<string, string> = {}) {
  const log = path.join(ws, "net.log");
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env: hermeticChildEnv(log, { NO_COLOR: "1", ...extraEnv }) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  const docs = documents(r.stdout);
  return { exit: r.status, docs, text: `${r.stdout}\n${r.stderr}`, brief: `exit ${r.status}\n${r.stdout.slice(0, 1500)}\n${r.stderr.slice(0, 800)}` };
}

beforeAll(() => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-runner-trust-cli-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };\n');
  fake = path.join(ws, process.platform === "win32" ? "fake-runner.exe" : "fake-runner");
  fs.writeFileSync(fake, "not a SilverScript runner\n");
});
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const fakeSha = () => createHash("sha256").update(fs.readFileSync(fake)).digest("hex");

describe("R-04 · an unverified runner is refused by policy and named in the report", () => {
  it("CT1 silver debug: RUNNER_UNVERIFIED, exit 3 (policy), the runner's path, SHA-256 and trust in the report, never executed", async () => {
    const r = await run(["silver", "debug", OWNED, "--entry", "bump", "--demo-fixture", "--json"], { HARDKAS_SILVER_RUNNER: fake });
    expect(r.exit, r.brief).toBe(3);
    const report = r.docs.find((d) => d?.schema === "hardkas.silver.debugReport.v1");
    expect(report?.contractVerdict, r.brief).toBe("BLOCKED_BY_TOOLCHAIN");
    expect(report?.verdicts?.scriptVm?.verdict).toBe("BLOCKED");
    expect(report?.verdicts?.scriptVm?.reason).toMatch(/^RUNNER_UNVERIFIED/);
    expect(report?.runner).toMatchObject({ path: fake, sha256: fakeSha(), source: "env", trust: "UNVERIFIED", provenance: "unmanaged-local-build" });
  });

  it("CT2 silver preflight (SCRIPT_VM_PREFLIGHT): the same refusal, exit 3, the runner named", async () => {
    const r = await run(["silver", "preflight", OWNED, "--entry", "bump", "--demo-fixture", "--json"], { HARDKAS_SILVER_RUNNER: fake });
    expect(r.exit, r.brief).toBe(3);
    const summary = r.docs.find((d) => d?.schema === "hardkas.silver.preflight.v1");
    expect(summary?.status, r.brief).toBe("BLOCKED");
    expect(summary?.runner).toMatchObject({ sha256: fakeSha(), trust: "UNVERIFIED" });
  });

  it("CT3 silver fuzz (SCRIPT_VM): refused before any sample runs, exit 3 — never a FUZZ FAIL", async () => {
    const r = await run(["silver", "fuzz", OWNED, "--entry", "bump", "--runs", "3", "--json"], { HARDKAS_SILVER_RUNNER: fake });
    expect(r.exit, r.brief).toBe(3);
    expect(r.text).toContain("SILVER_RUNNER_UNVERIFIED");
    expect(r.text).not.toContain("SILVER_FUZZ_FAILED");
  });
});
