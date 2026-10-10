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
//         command), the command does not report a clean, silent success — it fails with EVENT_LEDGER_APPEND_FAILED —
//         and the live holder's lock is never taken over;
//  EL2-I4 (EVENT-EMISSION-1 / D4, CLI side): an artifact a command writes is announced in the ledger (`tx plan` and
//         `tx sign --out` used to write with writeArtifact and record nothing);
//  D7: `lock list` / `lock doctor` tell the truth about an append lock (stale when its holder is dead on this host;
//         unverifiable when the record names no host);
//  D6: a dead telemetry lock neither delays a command by the 10 s wait nor loses the anomaly.
// EL2-I3 (`dag simulate-reorg` leaves no evidence) was a BEFORE finding of this wave and is NOT a closure condition of
// it: it belongs to SIMULATOR-STATE-TRUST-1 (the historical test is kept in the wave's evidence folder).
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
const plan = (ws: string, out: string) => cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", out, "--json"], ws);
/** Every JSON document a command printed on stdout. */
const docs = (stdout: string): any[] =>
  stdout
    .split(/\r?\n(?=[{[])/)
    .map((chunk) => {
      try {
        return JSON.parse(chunk.trim());
      } catch {
        return undefined;
      }
    })
    .filter((d) => d !== undefined);

const ledgerLines = (ws: string): string[] => {
  const file = path.join(ws, "events.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean) : [];
};
const ledgerEvents = (ws: string): any[] => ledgerLines(ws).map((l) => JSON.parse(l));
const telemetryEvents = (ws: string): any[] => {
  const file = path.join(ws, ".hardkas", "telemetry", "telemetry.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const lockDirOf = (ws: string) => path.join(ws, ".hardkas", "locks");
const lockPathOf = (ws: string) => path.join(lockDirOf(ws), "append-events.jsonl.lock");
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;
/** A lock file as a holder that died an hour ago would leave it. */
const leaveLock = (ws: string, name: string, content: string) => {
  const lock = path.join(lockDirOf(ws), name);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, content);
  const old = new Date(Date.now() - 3_600_000);
  fs.utimesSync(lock, old, old);
  return lock;
};
/** What earlier HardKAS releases wrote into an append lock: no hostname. */
const legacyRecord = (pid: number) => JSON.stringify({ pid, time: new Date(Date.now() - 3_600_000).toISOString() });
/** What the coordinator writes today (the workspace lock shape, with the host). */
const lockRecord = (name: string, pid: number) =>
  JSON.stringify({ schema: "hardkas.lock.v1", name, pid, command: "node hardkas tx send", cwd: "", hostname: os.hostname(), createdAt: new Date(Date.now() - 3_600_000).toISOString(), expiresAt: null });

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

  it("EL2-I1 · with an append lock left by a dead process, tx send still records its events, without the 10 s wait, and no stale lock survives", () => {
    const lock = leaveLock(ws, "append-events.jsonl.lock", legacyRecord(deadPid()));
    const before = ledgerLines(ws).length;
    const r = send(ws);
    expect({ exit: r.status, recorded: ledgerLines(ws).length > before, staleLockLeft: fs.existsSync(lock) }, `${r.ms} ms\n${r.all.slice(0, 600)}`).toEqual({
      exit: 0,
      recorded: true,
      staleLockLeft: false
    });
    expect(r.ms, "the base waited 10 s per event (≈100 s for the command)").toBeLessThan(40_000);
    const recoveries = telemetryEvents(ws).filter((t) => t.type === "STALE_LOCK_RECOVERY");
    expect(recoveries.some((t) => String(t.payload?.details).includes("append-events.jsonl.lock")), "the recovery is recorded").toBe(true);
  });

  it("EL2-I2 · while a live process holds the append lock for the whole command, tx send fails with EVENT_LEDGER_APPEND_FAILED, and the holder keeps its lock", async () => {
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
    const envelope = docs(r.stdout).find((d) => d?.ok === false);
    const holderLockIntact = fs.existsSync(lock) && fs.readFileSync(lock, "utf8") === mine;
    expect(
      { exit: r.status, code: envelope?.code, holderLockIntact, recorded: ledgerLines(ws).length - before },
      `exit ${r.status} in ${r.ms} ms\n${r.all.slice(0, 900)}`
    ).toEqual({ exit: 1, code: "EVENT_LEDGER_APPEND_FAILED", holderLockIntact: true, recorded: 0 });
    expect(envelope.message).toContain("could not be recorded in");
    expect(envelope.message).toContain("events.jsonl");
    expect(envelope.message).toContain(`process ${holder.pid}`);
    expect(r.ms, "one 10 s wait, not one per event").toBeLessThan(40_000);
  });

  it("EL2-I4 · the plan artifact tx plan writes is announced in the ledger, under the plan's own workflowId", () => {
    const before = ledgerLines(ws).length;
    const r = plan(ws, "plan.json");
    expect(r.status, r.all).toBe(0);
    const written = JSON.parse(fs.readFileSync(path.join(ws, "plan.json"), "utf8"));
    const announced = ledgerEvents(ws)
      .slice(before)
      .filter((e) => e.kind === "artifact.written" && e.artifactId === written.contentHash);
    expect(typeof written.contentHash).toBe("string");
    expect(announced.map((e) => path.basename(e.payload.path)).sort()).toEqual(["plan.json", path.basename(announced.find((e) => e.payload.path.includes(".hardkas"))?.payload.path ?? "")].sort());
    expect(announced.length, "the --out copy and the .hardkas/artifacts copy").toBe(2);
    expect(announced.every((e) => e.workflowId === written.workflowId && e.sourceSubsystem === "cli:tx-plan")).toBe(true);
  });

  it("EL2-I4 · the copy tx sign --out writes is announced like the store's copy", () => {
    expect(plan(ws, "plan.json").status).toBe(0);
    const before = ledgerLines(ws).length;
    const r = cli(["tx", "sign", "plan.json", "--out", "signed.json", "--json"], ws);
    expect(r.status, r.all).toBe(0);
    const signed = JSON.parse(fs.readFileSync(path.join(ws, "signed.json"), "utf8"));
    const announced = ledgerEvents(ws)
      .slice(before)
      .filter((e) => e.kind === "artifact.written" && e.artifactId === signed.contentHash)
      .map((e) => ({ file: path.basename(e.payload.path), source: e.sourceSubsystem, workflowId: e.workflowId }));
    expect(announced).toContainEqual({ file: "signed.json", source: "cli:tx-sign", workflowId: signed.workflowId });
    expect(announced.some((a) => a.source === "sdk:artifacts-manager"), "the store's copy (sdk.tx.sign)").toBe(true);
  });

  it("D7 · lock list / lock doctor call a dead holder's append lock stale, and the next command recovers it", () => {
    leaveLock(ws, "append-events.jsonl.lock", lockRecord("append-events.jsonl", deadPid()));
    const listRun = cli(["lock", "list", "--json"], ws);
    const list = docs(listRun.stdout)[0];
    const mine = list?.result?.find((l: any) => l.name === "append-events.jsonl");
    expect({ liveness: mine?.liveness, isAlive: mine?.isAlive, host: mine?.metadata?.hostname }, listRun.all.slice(0, 1200)).toEqual({ liveness: "stale", isAlive: false, host: os.hostname() });
    const doctor = cli(["lock", "doctor"], ws);
    expect(doctor.stdout).toContain("Stale lock found: append-events.jsonl");
    expect(doctor.stdout).toContain("lock clear append-events.jsonl --if-dead");
    expect(doctor.stdout).not.toContain("held by live processes");

    expect(plan(ws, "p.json").status).toBe(0);
    expect(fs.existsSync(lockPathOf(ws)), "recovered by the command's first append").toBe(false);
    expect(docs(cli(["lock", "list", "--json"], ws).stdout)[0]?.result).toEqual([]);
  });

  it("D7 · an append lock without a hostname (an earlier HardKAS) is reported as unverifiable, never as live", () => {
    leaveLock(ws, "append-events.jsonl.lock", legacyRecord(deadPid()));
    const mine = docs(cli(["lock", "list", "--json"], ws).stdout)[0]?.result?.find((l: any) => l.name === "append-events.jsonl");
    expect(mine?.liveness).toBe("unverifiable");
    expect(String(mine?.detail)).toContain("no hostname recorded");
    const doctor = cli(["lock", "doctor"], ws);
    expect(doctor.stdout).toContain("cannot be verified: append-events.jsonl");
    expect(doctor.stdout).not.toContain("held by live processes");
  });

  it("D6 · a dead telemetry lock costs no wait and no anomaly: the telemetry appends recover it like the ledger does", () => {
    const telemetryLock = leaveLock(ws, "append-telemetry.jsonl.lock", legacyRecord(deadPid()));
    // a dead workspace lock makes the lock layer log a STALE_LOCK_RECOVERY anomaly through the telemetry
    leaveLock(ws, "artifacts.lock", JSON.stringify({ schema: "hardkas.lock.v1", name: "artifacts", pid: deadPid(), command: "x", cwd: ws, hostname: os.hostname(), createdAt: new Date(Date.now() - 3_600_000).toISOString(), expiresAt: null }));
    const r = plan(ws, "b.json");
    expect(r.status, r.all).toBe(0);
    expect(r.ms, "the base took one 10 s wait per telemetry append").toBeLessThan(30_000);
    expect(fs.existsSync(telemetryLock)).toBe(false);
    const recoveries = telemetryEvents(ws).filter((t) => t.type === "STALE_LOCK_RECOVERY").map((t) => String(t.payload?.details));
    // lock.ts names the pid, not the lock: "Recovered lock held by dead process (PID: n)"
    expect(recoveries.some((d) => /Recovered lock held by dead process \(PID: \d+\)/.test(d)), `the workspace lock's recovery (lock.ts) landed: ${JSON.stringify(recoveries)}`).toBe(true);
    expect(recoveries.some((d) => d.includes("append-telemetry.jsonl.lock")), "the telemetry lock's own recovery is recorded").toBe(true);
  });
});
