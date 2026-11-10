import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// RC1 · R3: scripts/ci-toolchain-install.mjs, the CI step that installs the pinned toolchains. It retries only a failed
// download (TOOLCHAIN_DOWNLOAD_FAILED, as the 504s GitHub returned to anonymous release downloads on 2026-11-09), never a
// digest mismatch or an unsupported toolchain, and writes each failure as an escaped GitHub annotation. The CLI here is
// a fake that answers with the envelopes of the real one (`toolchain install <id> --json`), so nothing is downloaded.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(ROOT, "scripts", "ci-toolchain-install.mjs");

const FAKE_CLI = `
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
const [, , cmd, sub, id, json] = process.argv;
if (cmd !== "toolchain" || sub !== "install" || json !== "--json") { console.error("bad argv " + process.argv.join(" ")); process.exit(9); }
const state = process.env.FAKE_TOOLCHAIN_STATE;
const counter = path.join(state, id + ".count");
const n = existsSync(counter) ? Number(readFileSync(counter, "utf8")) : 0;
writeFileSync(counter, String(n + 1));
const plan = Object.fromEntries(process.env.FAKE_TOOLCHAIN_PLAN.split(";").map((p) => p.split("=")).map(([k, v]) => [k, v.split(",")]));
const step = (plan[id] ?? ["UNKNOWN"])[n] ?? "OK";
const out = (v) => process.stdout.write(JSON.stringify(v, null, 2) + "\\n");
if (step === "OK") { out({ status: "TOOLCHAIN_INSTALLED", dir: "/fake/" + id }); process.exit(0); }
if (step === "DL") { out({ ok: false, code: "TOOLCHAIN_DOWNLOAD_FAILED", message: "GET https://github.com/x/releases/download/" + id + " returned HTTP 504\\nsecond line %0A ::error::injected", mode: "cli" }); process.exit(1); }
if (step === "MISMATCH") { out({ ok: false, code: "TOOLCHAIN_ASSET_DIGEST_MISMATCH", message: id + ": sha256 aa, expected bb. Nothing was installed.", mode: "cli" }); process.exit(4); }
if (step === "UNKNOWN") { out({ ok: false, code: "TOOLCHAIN_UNKNOWN", message: "Unknown toolchain '" + id + "'", mode: "cli" }); process.exit(2); }
process.exit(7);
`;

let dir: string;
let state: string;
let cli: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "rc1-r3-ci-toolchain-"));
  state = path.join(dir, "state");
  cli = path.join(dir, "fake-cli.mjs");
  writeFileSync(cli, FAKE_CLI);
  mkdirSync(state, { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(ids: string[], plan: string, extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HARDKAS_CI_TOOLCHAIN_CLI: cli,
    HARDKAS_CI_TOOLCHAIN_BACKOFF_MS: "0",
    HARDKAS_CI_TOOLCHAIN_ATTEMPTS: "4",
    FAKE_TOOLCHAIN_STATE: state,
    FAKE_TOOLCHAIN_PLAN: plan,
    GITHUB_ACTIONS: "",
    ...extraEnv
  };
  const r = spawnSync(process.execPath, [SCRIPT, ...ids], { encoding: "utf8", env, windowsHide: true });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function attempts(id: string): number {
  const f = path.join(state, `${id}.count`);
  return existsSync(f) ? Number(readFileSync(f, "utf8")) : 0;
}

describe("RC1 · R3 · scripts/ci-toolchain-install.mjs", () => {
  it("retries a failed download and succeeds when a later attempt does", () => {
    const r = run(["kaspa-wasm"], "kaspa-wasm=DL,DL,OK");
    expect(r.status).toBe(0);
    expect(attempts("kaspa-wasm")).toBe(3);
    expect(r.stdout).toContain("kaspa-wasm: TOOLCHAIN_INSTALLED");
  });

  it("never retries a digest mismatch: it fails at once with the CLI's exit code", () => {
    const r = run(["silverc"], "silverc=MISMATCH,OK");
    expect(r.status).toBe(4);
    expect(attempts("silverc")).toBe(1);
    expect(r.stderr).toContain("TOOLCHAIN_ASSET_DIGEST_MISMATCH is not a download failure; not retried");
  });

  it("never retries a toolchain the platform does not offer", () => {
    const r = run(["silverc"], "silverc=UNKNOWN,OK");
    expect(r.status).toBe(2);
    expect(attempts("silverc")).toBe(1);
  });

  it("fails after the last attempt when every download fails", () => {
    const r = run(["kaspa-wasm"], "kaspa-wasm=DL,DL,DL,DL,OK", { HARDKAS_CI_TOOLCHAIN_ATTEMPTS: "3" });
    expect(r.status).toBe(1);
    expect(attempts("kaspa-wasm")).toBe(3);
    expect(r.stderr).toContain("TOOLCHAIN_DOWNLOAD_FAILED after 3 attempts");
  });

  it("installs every id in order and stops at the first one that fails", () => {
    const r = run(["kaspa-wasm", "silverc", "third"], "kaspa-wasm=OK;silverc=MISMATCH;third=OK");
    expect(r.status).toBe(4);
    expect(attempts("kaspa-wasm")).toBe(1);
    expect(attempts("silverc")).toBe(1);
    expect(attempts("third")).toBe(0);
  });

  it("writes escaped GitHub annotations only under GitHub Actions", () => {
    const quiet = run(["kaspa-wasm"], "kaspa-wasm=DL,OK");
    expect(quiet.status).toBe(0);
    expect(quiet.stdout).not.toContain("::warning");

    rmSync(path.join(state, "kaspa-wasm.count"));
    const gh = run(["kaspa-wasm"], "kaspa-wasm=DL,DL", { GITHUB_ACTIONS: "true", HARDKAS_CI_TOOLCHAIN_ATTEMPTS: "2" });
    expect(gh.status).toBe(1);
    const lines = gh.stdout.split(/\r?\n/).filter((l) => l.startsWith("::"));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^::warning title=toolchain install kaspa-wasm::TOOLCHAIN_DOWNLOAD_FAILED on attempt 1\/2/);
    expect(lines[1]).toMatch(/^::error title=toolchain install kaspa-wasm::TOOLCHAIN_DOWNLOAD_FAILED after 2 attempts/);
    // the message's newline and its literal "%0A" are escaped, so it cannot start a second workflow command
    for (const l of lines) {
      expect(l).toContain("504%0Asecond line %250A ::error::injected");
    }
  });

  it("refuses to run without a toolchain id", () => {
    const r = run([], "x=OK");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage:");
  });
});
