import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 120_000 });

// EVENT-LEDGER-2 · the event ledger as a user meets it through the built CLI, in a simulated workspace. The shortcut
// `tx send` is the probe command: it records about ten events (workflow.started/signed/receipt, artifact.written …).
//  EL2-I1 (APPEND-LOCK-STALE-1, the original repro): a leftover append lock from a holder that died never makes a command
//         lose its events, and is not left behind for the next command;
//  EL2-I2 (no silent loss): when events cannot be persisted (the append lock held by a live process for the whole
//         command), the command does not report a clean, silent success — it fails, or it says so — and the live
//         holder's lock is never taken over;
//  EL2-I3 (SIMULATOR-DAG-EVIDENCE-1): `dag simulate-reorg` changes the simulated chain and leaves evidence of that change
//         (a ledger event or an artifact);
//  EL2-I4 (EVENT-EMISSION-1, CLI side): an artifact a command writes is announced in the ledger (`tx plan` writes its plan
//         with writeArtifact and records nothing).
// Every workspace lives in a temporary directory created here.

interface Run {
  status: number | null;
  stdout: string;
  all: string;
  ms: number;
}
const cli = (args: string[], cwd: string, timeout = 280_000): Run => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", input: "", timeout });
  return { status: r.status, stdout: r.stdout ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}`, ms: Date.now() - t0 };
};
const send = (ws: string) => cli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], ws);

const ledgerLines = (ws: string): string[] => {
  const file = path.join(ws, "events.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean) : [];
};
const lockPathOf = (ws: string) => path.join(ws, ".hardkas", "locks", "append-events.jsonl.lock");
const filesUnder = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
};
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;

describe("EVENT-LEDGER-2 · the CLI's event ledger", () => {
  let ws: string;
  let holder: ChildProcess | undefined;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-el2-cli-"));
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(async () => {
    if (holder && holder.exitCode === null) {
      holder.kill();
      await new Promise((r) => setTimeout(r, 300));
    }
    holder = undefined;
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("control · a shortcut tx send records its events in events.jsonl and leaves no lock", () => {
    const before = ledgerLines(ws).length;
    const r = send(ws);
    expect(r.status, r.all).toBe(0);
    expect(ledgerLines(ws).length).toBeGreaterThan(before);
    expect(fs.existsSync(lockPathOf(ws))).toBe(false);
  });

  it("EL2-I1 · with an append lock left by a dead process, tx send still records its events and no stale lock survives", () => {
    const lock = lockPathOf(ws);
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, JSON.stringify({ pid: deadPid(), time: new Date(Date.now() - 3_600_000).toISOString() }));
    const old = new Date(Date.now() - 3_600_000);
    fs.utimesSync(lock, old, old);
    const before = ledgerLines(ws).length;
    const r = send(ws);
    expect({ exit: r.status, recorded: ledgerLines(ws).length > before, staleLockLeft: fs.existsSync(lock) }, `${r.ms} ms\n${r.all.slice(0, 600)}`).toEqual({
      exit: 0,
      recorded: true,
      staleLockLeft: false
    });
  });

  it("EL2-I2 · while a live process holds the append lock for the whole command, tx send does not report a clean, silent success, and the holder keeps its lock", async () => {
    const lock = lockPathOf(ws);
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    const mineFile = path.join(ws, "holder-lock.txt");
    // A live holder (a stuck HardKAS process holding the ledger) that outlives the command; killed after the test.
    holder = spawn(
      process.execPath,
      [
        "-e",
        `const fs=require("fs");const fd=fs.openSync(${JSON.stringify(lock)},"wx");const mine=JSON.stringify({pid:process.pid,time:new Date().toISOString()});` +
          `fs.writeSync(fd,mine);fs.closeSync(fd);fs.writeFileSync(${JSON.stringify(mineFile)},mine);setTimeout(()=>{},600000);`
      ],
      { stdio: "ignore" }
    );
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(mineFile) && Date.now() < deadline) await new Promise((res) => setTimeout(res, 20));
    const mine = fs.readFileSync(mineFile, "utf8");
    const before = ledgerLines(ws).length;
    const r = send(ws);
    const told = /EVENT_LEDGER|events\.jsonl|event ledger|ledger/i.test(r.all);
    const holderLockIntact = fs.existsSync(lock) && fs.readFileSync(lock, "utf8") === mine;
    expect(
      { failedOrTold: r.status !== 0 || told, holderLockIntact },
      `exit ${r.status} in ${r.ms} ms; ledger ${before} → ${ledgerLines(ws).length}; said anything about the ledger: ${told}\n${r.all.slice(0, 600)}`
    ).toEqual({ failedOrTold: true, holderLockIntact: true });
  });

  it("EL2-I3 · dag simulate-reorg leaves evidence of the change it makes to the simulated chain", () => {
    const evBefore = ledgerLines(ws).length;
    const artifactsBefore = filesUnder(path.join(ws, ".hardkas", "artifacts")).length;
    const stateBefore = fs.readFileSync(path.join(ws, ".hardkas", "localnet.json"), "utf8");
    const r = cli(["dag", "simulate-reorg", "--depth", "1"], ws);
    expect(r.status, r.all).toBe(0);
    const stateChanged = fs.readFileSync(path.join(ws, ".hardkas", "localnet.json"), "utf8") !== stateBefore;
    const evidence = ledgerLines(ws).length > evBefore || filesUnder(path.join(ws, ".hardkas", "artifacts")).length > artifactsBefore;
    expect({ stateChanged, evidence }).toEqual({ stateChanged: true, evidence: true });
  });

  it("EL2-I4 · the plan artifact tx plan writes is announced in the ledger", () => {
    const before = ledgerLines(ws).length;
    const r = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "plan.json", "--json"], ws);
    expect(r.status, r.all).toBe(0);
    const planHash = JSON.parse(fs.readFileSync(path.join(ws, "plan.json"), "utf8")).contentHash as string;
    const announced = ledgerLines(ws).slice(before).some((l) => l.includes(planHash));
    expect({ planHash: typeof planHash, announced }).toEqual({ planHash: "string", announced: true });
  });
});
