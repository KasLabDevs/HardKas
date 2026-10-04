import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 120_000 });

// ARTIFACT-MUTATION-UNITS (phase 2B): `tx plan`, `tx sign` and `tx send` no longer hold the artifact store for the whole
// command. Measured before the change (2026-10-03, cut23 runs/nethold-1): against a node that never answered, `tx send`
// and `tx plan` held `artifacts` 31.1 s without writing anything; with the store held elsewhere they were refused at once
// (LOCK_HELD). Now each of their store writes takes the store through the gate and waits for it like any other writer.
// The built CLI runs as a separate process, against a store held by this test process.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("tx plan / sign / send · no command-level hold of the artifact store", () => {
  let ws: string;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tx-lock-scope-"));
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    const r = spawnSync(process.execPath, [cliDist, "tx", "plan", "alice", "bob", "--amount", "1", "--network", "simulated", "--out", "plan.json", "--json"], {
      cwd: ws,
      env: childEnv(),
      encoding: "utf8",
      timeout: 120_000
    });
    if (r.status !== 0) throw new Error(`setup: tx plan failed\n${r.stdout}\n${r.stderr}`);
  });

  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  /** The store held by this (live) process, as another cooperative writer would hold it. */
  const holdStore = () => {
    const file = path.join(ws, ".hardkas", "locks", "artifacts.lock");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ schema: "hardkas.lock.v1", name: "artifacts", pid: process.pid, command: "another process (test)", cwd: ws, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null }, null, 2)
    );
    return () => fs.rmSync(file, { force: true });
  };
  /** True once a writer has logged that it waits for the store (each wait poll logs LOCK_CONTENTION). */
  const someoneWaitsForStore = () => {
    const f = path.join(ws, ".hardkas", "telemetry", "telemetry.jsonl");
    return fs.existsSync(f) && fs.readFileSync(f, "utf-8").split("\n").some((l) => l.includes("LOCK_CONTENTION") && l.includes("lock artifacts"));
  };

  async function runWhileStoreHeld(args: string[]) {
    const telemetry = path.join(ws, ".hardkas", "telemetry", "telemetry.jsonl");
    fs.rmSync(telemetry, { force: true });
    const release = holdStore();
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    let exit: number | null | undefined;
    const closed = new Promise<void>((resolve) => child.on("close", (code) => ((exit = code), resolve())));
    let exitedWhileHeld: boolean;
    let outputWhileHeld: string;
    try {
      // until the command waits for the store, exits, or 15 s pass
      const t0 = Date.now();
      while (exit === undefined && !someoneWaitsForStore() && Date.now() - t0 < 15_000) await sleep(100);
      exitedWhileHeld = exit !== undefined;
      outputWhileHeld = stdout + stderr;
    } finally {
      release();
    }
    await closed;
    return { exitedWhileHeld, outputWhileHeld, exit, stdout, stderr };
  }

  it.each([
    ["tx plan", ["tx", "plan", "alice", "bob", "--amount", "1", "--network", "simulated", "--json"]],
    ["tx sign", ["tx", "sign", "plan.json", "--json"]],
    ["tx send", ["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"]]
  ])("%s is not refused by a holder of the store: it waits for the store at its write, then completes", async (_name, args) => {
    const r = await runWhileStoreHeld(args);
    expect(r.exitedWhileHeld, `exited while the store was held:\n${r.outputWhileHeld}`).toBe(false);
    expect(r.exit, `${r.stdout}\n${r.stderr}`).toBe(0);
  });
});
