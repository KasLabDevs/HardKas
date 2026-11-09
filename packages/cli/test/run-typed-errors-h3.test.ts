import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

// L1-CORE-1 B2 · H3 (TN10-24): `hardkas run` reported a failing script without its cause. The script runs in a child
// (tsx) whose stderr went straight to the terminal; the command answered only "Script exited with non-zero code 1"
// (the certification saw UNKNOWN_ERROR). Now the cause is part of the typed answer: the error the script threw
// (SCRIPT_EXECUTION_FAILED with its name and message), or the project package the wrapper needs and does not find
// (RUN_DEPENDENCY_MISSING, naming it and what to run). With --json stdout is ONE envelope: the "Running script" log
// line (CLI-CONTRACT-2B D3) and the script's own output go to stderr. Offline (the simulator), loopback only.

const made: string[] = [];
let linked = "";
let bare = "";

function workspace(prefix: string, withTesting: boolean): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(ws);
  if (withTesting) {
    fs.mkdirSync(path.join(ws, "node_modules", "@hardkas"), { recursive: true });
    fs.symlinkSync(path.resolve(__dirname, "../../testing"), path.join(ws, "node_modules", "@hardkas", "testing"), "junction");
  }
  fs.writeFileSync(path.join(ws, "boom.ts"), "throw new Error('boom from user script');\n");
  fs.writeFileSync(path.join(ws, "noisy.ts"), "console.log('a line the script prints');\n");
  return ws;
}

function run(cwd: string, args: string[]) {
  const r = spawnSync(process.execPath, [cliDist, "run", ...args], { cwd, encoding: "utf8", env: childEnv(), timeout: 150_000 });
  const stdout = r.stdout ?? "";
  const docs = stdout
    .split(/\r?\n(?=\{)/)
    .map((c) => {
      try {
        return JSON.parse(c);
      } catch {
        return undefined;
      }
    })
    .filter((d) => d !== undefined);
  return { status: r.status, stdout, stderr: r.stderr ?? "", docs, brief: `exit ${r.status}\n${stdout.slice(0, 1500)}\n${(r.stderr ?? "").slice(0, 1500)}` };
}

beforeAll(() => {
  linked = workspace("hk-run-h3-linked-", true);
  bare = workspace("hk-run-h3-bare-", false);
});

afterAll(() => {
  for (const ws of made) {
    fs.rmSync(path.join(ws, "node_modules", "@hardkas", "testing"), { force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

describe("H3 · `hardkas run` answers a failing script with a typed error and its cause", () => {
  it("H3-1 the script throws: SCRIPT_EXECUTION_FAILED naming the error it threw; one JSON envelope", () => {
    const r = run(linked, ["boom.ts", "--network", "simulated", "--json"]);
    expect(r.status, r.brief).toBe(1);
    expect(r.docs.length, r.brief).toBe(1);
    expect(r.docs[0], r.brief).toMatchObject({ ok: false, code: "SCRIPT_EXECUTION_FAILED" });
    expect(String(r.docs[0].message), r.brief).toMatch(/boom from user script/);
    expect(r.stdout + r.stderr, r.brief).not.toMatch(/UNKNOWN_ERROR/);
  });

  it("H3-2 the project lacks a package the wrapper imports: RUN_DEPENDENCY_MISSING naming it and what to run; one JSON envelope", () => {
    const r = run(bare, ["noisy.ts", "--network", "simulated", "--json"]);
    expect(r.status, r.brief).toBe(1);
    expect(r.docs.length, r.brief).toBe(1);
    expect(r.docs[0], r.brief).toMatchObject({ ok: false, code: "RUN_DEPENDENCY_MISSING" });
    expect(String(r.docs[0].message), r.brief).toMatch(/@hardkas\/testing/);
    expect(String(r.docs[0].message), r.brief).toMatch(/npm install/);
  });

  it("H3-3 (CLI-CONTRACT-2B D3) a missing script: one JSON envelope, SCRIPT_NOT_FOUND (the log line went before it)", () => {
    const r = run(linked, ["no-such-script.ts", "--json"]);
    expect(r.docs.length, r.brief).toBe(1);
    expect(r.docs[0], r.brief).toMatchObject({ ok: false, code: "SCRIPT_NOT_FOUND" });
  });

  it("H3-4 (control) a script that prints and succeeds: exit 0, its output on stderr, one JSON envelope on stdout", () => {
    const r = run(linked, ["noisy.ts", "--network", "simulated", "--json"]);
    expect(r.status, r.brief).toBe(0);
    expect(r.docs.length, r.brief).toBe(1);
    expect(r.docs[0], r.brief).toMatchObject({ ok: true, command: "run" });
    expect(r.stdout, r.brief).not.toMatch(/a line the script prints/);
    expect(r.stderr, r.brief).toMatch(/a line the script prints/);
  });
});
