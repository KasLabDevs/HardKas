import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// R0 · R0-I1: a command's result is its exit status, never an abrupt termination. The CLI entry sets process.exitCode
// and lets the runtime close naturally; every exit code a command reports — success, usage error, runtime failure,
// policy refusal, a rendered-and-swallowed error — reaches the process unchanged, and a command that returns ends by
// itself (nothing it leaves behind keeps the process alive).

const cli = (args: string[], cwd: string) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", timeout: 120_000, input: "" });
  return { status: r.status, signal: r.signal, ms: Date.now() - t0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};
const codeOf = (r: { stdout: string; stderr: string }) => {
  try {
    return JSON.parse(r.stdout)?.code ?? null;
  } catch {
    return /\[([A-Z][A-Z0-9_]+)\]/.exec(`${r.stdout}\n${r.stderr}`)?.[1] ?? null;
  }
};

describe("R0 · CLI lifecycle: exit status set, natural close", () => {
  let parent: string;
  let ws: string;
  let empty: string;

  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r0-lifecycle-"));
    ws = path.join(parent, "ws");
    empty = path.join(parent, "empty");
    fs.mkdirSync(ws);
    fs.mkdirSync(empty);
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};\n");
    const r = cli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], ws);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("the CLI entry never ends a command with process.exit (R0-I1)", () => {
    const entry = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");
    const code = entry.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/process\.exit\s*\(/);
    expect(code).toMatch(/process\.exitCode\s*=/);
  });

  it("every reported exit code reaches the process: 0, usage 2, runtime 1, policy 3, a rendered-and-swallowed error", () => {
    const rows = {
      success: cli(["status"], ws),
      usage: cli(["verify", "--json"], empty),
      runtime: cli(["artifact", "verify", "no-such-file.json", "--json"], ws),
      policy: cli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "mainnet", "--json"], ws),
      swallowed: cli(["dev", "accounts", "reveal", "nobody-here"], ws)
    };
    expect(Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, { exit: r.status, code: k === "success" ? null : codeOf(r) }]))).toEqual({
      success: { exit: 0, code: null },
      usage: { exit: 2, code: "WORKSPACE_NOT_FOUND" },
      runtime: { exit: 1, code: "PATH_NOT_FOUND" },
      policy: { exit: 3, code: "TX_SEND_CONFIRMATION_REQUIRED" },
      swallowed: { exit: 2, code: "DEV_ACCOUNT_NOT_FOUND" }
    });
  });

  it("a command that returns ends by itself: `dev --once` exits 0 without being killed", () => {
    const r = cli(["dev", "--once"], ws);
    expect({ exit: r.status, signal: r.signal }, r.stderr).toEqual({ exit: 0, signal: null });
  });
});
