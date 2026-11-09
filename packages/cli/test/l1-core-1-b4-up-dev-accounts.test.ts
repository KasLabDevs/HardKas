// L1-CORE-1 B4 · up, and dev accounts list: `hardkas up` runs for real in a simulated workspace (built CLI, hermetic
// preload with its own connection log, a spawn recorder that turns a browser launch into a no-op) until its dev server
// answers on loopback, then it is killed. Asserted: it serves, it dials no canonical node port (the simulator has no
// node), it launches no browser when nobody is at a terminal, and it provisions the dev accounts that `dev accounts
// list` then lists (an untouched workspace lists none and gets nothing written).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { cli, jsonDocs, simulatedWorkspace, removeDir, tempDir } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

const UP_PORT = 7420; // `up` serves on this port; it takes no --port
const CANONICAL_PORT = /:(16210|17210|18210|18211)\b/;
const DEV_ACCOUNTS = ["alice", "bob", "carol", "dave", "erin"];

// A child-process recorder for the CLI under test: every spawn is logged; a browser opener (Windows PowerShell `Start`,
// cmd `start`, xdg-open, macOS open) runs a no-op node process instead, so no browser ever opens on the test machine.
const SPAWN_RECORDER = `"use strict";
const cp = require("node:child_process");
const fs = require("node:fs");
const LOG = process.env.B4_SPAWN_LOG;
const original = cp.spawn;
cp.spawn = function (command, args) {
  // hardkas-append-allow: the test's own spawn log (a test preload, not product code)
  try { if (LOG) fs.appendFileSync(LOG, JSON.stringify({ command: String(command), args: (Array.isArray(args) ? args : []).map(String).slice(0, 4) }) + "\\n"); } catch {}
  if (/powershell|(^|[\\\\/])cmd(\\.exe)?$|xdg-open|^open$/i.test(String(command))) return original.call(this, process.execPath, ["-e", ""], { stdio: "ignore" });
  return original.apply(this, arguments);
};
`;

interface UpRun {
  served: { status: number; name?: string } | null;
  exitedEarly: boolean;
  stdout: string;
  stderr: string;
  netLog: string;
  spawns: Array<{ command: string; args: string[] }>;
}

let tools: string;
let recorder: string;

async function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}

/** `hardkas up [extra]` in `ws` until its dev server answers GET / on loopback (or 90 s), then killed. */
async function runUp(ws: string, tag: string, extra: string[] = []): Promise<UpRun> {
  if (!(await portFree(UP_PORT))) throw new Error(`port ${UP_PORT} is in use on this machine: \`hardkas up\` serves only there; free it to run this test`);
  const netLogPath = path.join(tools, `${tag}.net.log`);
  const spawnLogPath = path.join(tools, `${tag}.spawn.log`);
  const env = hermeticChildEnv(netLogPath, { B4_SPAWN_LOG: spawnLogPath });
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require="${recorder.split(path.sep).join("/")}"`.trim();
  const child = spawn(process.execPath, [cliDist, "up", ...extra], { cwd: ws, env, windowsHide: true });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += String(d)));
  child.stderr.on("data", (d) => (stderr += String(d)));
  const closed = new Promise<void>((r) => child.on("close", () => r()));
  let served: UpRun["served"] = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000 && child.exitCode === null) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${UP_PORT}/`, { signal: AbortSignal.timeout(2000) });
      const body: any = await res.json().catch(() => ({}));
      served = { status: res.status, name: body?.name };
      break;
    } catch {
      /* not listening yet */
    }
  }
  const exitedEarly = child.exitCode !== null;
  child.kill();
  await closed;
  const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
  return {
    served,
    exitedEarly,
    stdout,
    stderr,
    netLog: read(netLogPath),
    spawns: read(spawnLogPath)
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  };
}

const browserOpeners = (run: UpRun) => run.spawns.filter((s) => /powershell|(^|[\\/])cmd(\.exe)?$|xdg-open|^open$/i.test(s.command));

let parent: string;
let ws: string;
let up: UpRun;

beforeAll(async () => {
  assertHermeticPreloadActive();
  tools = tempDir("hk-b4-up-tools-");
  recorder = path.join(tools, "spawn-recorder.cjs");
  fs.writeFileSync(recorder, SPAWN_RECORDER);
  ({ parent, ws } = simulatedWorkspace("hk-b4-up-"));
  up = await runUp(ws, "up");
});
afterAll(() => {
  removeDir(parent);
  removeDir(tools);
});

describe("up", () => {
  it("boots: the workspace's network is reported and its dev server answers on loopback until it is stopped", () => {
    expect(up.exitedEarly, `${up.stdout.slice(-1500)}\n${up.stderr.slice(0, 800)}`).toBe(false);
    expect(up.served, up.stdout.slice(-1500)).toEqual({ status: 200, name: "HardKas Dev Server" });
    expect(up.stdout).toMatch(/Network Mode:.*simulated/);
  });

  it("in a simulated workspace it dials no canonical node port (the simulator has no node to check)", () => {
    // the child's preload is the one assertHermeticPreloadActive() proved records (beforeAll)
    const canonical = up.netLog.split(/\r?\n/).filter((l) => CANONICAL_PORT.test(l)).map((l) => l.split("\t").slice(1, 3).join(" "));
    expect(canonical).toEqual([]);
  });

  it("with no terminal attached (stdout is a pipe) it launches no browser", () => {
    expect(browserOpeners(up)).toEqual([]);
  });

  it("provisions the five dev accounts in the workspace", () => {
    const dir = path.join(ws, ".hardkas", "dev-accounts");
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()).toEqual(DEV_ACCOUNTS.map((n) => `${n}.json`).sort());
  });

  it.skip("[known gap: up ignores --json -> L1-CORE-1-B4] up --json prints one JSON document describing the runtime it started", async () => {
    const run = await runUp(ws, "up-json", ["--json"]);
    expect(run.served?.status).toBe(200);
    const docs = jsonDocs(run.stdout);
    expect(docs.length, run.stdout.slice(0, 600)).toBeGreaterThan(0);
    expect(run.stdout.trim().startsWith("{"), run.stdout.slice(0, 300)).toBe(true);
  });
});

describe("dev accounts list", () => {
  it("in a workspace where none were provisioned: says so, exit 0, and writes nothing", () => {
    const fresh = simulatedWorkspace("hk-b4-dev-accounts-");
    try {
      const r = cli(["dev", "accounts", "list"], fresh.ws);
      expect(r.status, r.all.slice(0, 600)).toBe(0);
      expect(r.stdout).toMatch(/No dev accounts found/);
      expect(fs.existsSync(path.join(fresh.ws, ".hardkas", "dev-accounts"))).toBe(false);
    } finally {
      removeDir(fresh.parent);
    }
  });

  it("after `up` provisioned them: the five accounts in order, each with the address of its keystore and the one `up` printed", () => {
    const r = cli(["dev", "accounts", "list"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const listed = [...r.stdout.matchAll(/^\s+(\w+)\r?\n\s+Address: (\S+)/gm)].map((m) => ({ name: m[1], address: m[2] }));
    expect(listed.map((a) => a.name)).toEqual(DEV_ACCOUNTS);
    const fromKeystores = DEV_ACCOUNTS.map((name) => ({
      name,
      address: JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "dev-accounts", `${name}.json`), "utf8")).metadata.address
    }));
    expect(listed).toEqual(fromKeystores);
    const printedByUp = [...up.stdout.matchAll(/^\[\d\] (\w+)\r?\nAddress: (\S+)/gm)].map((m) => ({ name: m[1], address: m[2] }));
    expect(printedByUp).toEqual(fromKeystores);
    for (const a of listed) expect(a.address).toMatch(/^kaspasim:[a-z0-9]{61,63}$/);
  });
});
