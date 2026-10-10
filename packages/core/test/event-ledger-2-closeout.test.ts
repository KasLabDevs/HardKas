import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { Worker } from "node:worker_threads";
import { attachLedgerAppender, coreEvents, createEventEnvelope, eventLedgerPath, isEventLedgerAppendFailure } from "../src/events.js";
import { clearLock, listLocks } from "../src/lock.js";
import { asArtifactId, asCorrelationId, asEventSequence, asNetworkId, asWorkflowId } from "../src/domain-types.js";

vi.setConfig({ testTimeout: 90_000 });

// EVENT-LEDGER-2 · reviewer closeout, points 3 and 4. The rule: a holder that is verifiably alive is never taken over,
// and neither is a recovery that is still valid.
//  CL-3 (same pid): a lock whose record names THIS process's pid is held by a live process — this one, through another
//       of its flows (a worker thread here) — so it is waited for, never judged abandoned because the pid is ours;
//  CL-4 (recovery race): a recovery lock is never taken over while its recoverer is alive, however long it has been
//       suspended; a recoverer suspended between its check and its unlink therefore never removes the lock of a holder
//       that came after it;
//  CL-4c (final closeout, fail closed): a recovery lock whose recoverer is gone is not removed automatically either —
//       read, compare and unlink is not atomic, so removing it could race with another recoverer. The append fails at
//       once with APPEND_LOCK_RECOVERY_BLOCKED, the lock tools show that recovery lock and clear it once its process is
//       gone, and the next append recovers the abandoned append lock by itself.
// The recovery lock lives at <lock name>.recover.lock (a workspace lock the lock tools read); the closeout's first round
// kept it at <lock>.recover. The recoverers below hold, and the leftovers are planted at, both paths, so the same tests
// judge both versions.
// Every participant other than the ledger under test is a separate process or thread acting on the files exactly as
// the protocol does; every workspace is a temporary directory created here.

const envelope = (n: number) =>
  createEventEnvelope({
    kind: "artifact.written",
    domain: "integrity",
    workflowId: asWorkflowId("wf_el2_closeout"),
    correlationId: asCorrelationId("corr_el2_closeout"),
    networkId: asNetworkId("simulated"),
    sequenceNumber: asEventSequence(n),
    globalOffset: 0,
    sourceSubsystem: "event-ledger-2-closeout-test",
    artifactId: asArtifactId(`closeout-artifact-${n}`),
    payload: { artifactId: asArtifactId(`closeout-artifact-${n}`), path: `closeout-${n}.json` }
  });

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "hk-el2-cl-"));
const lockPathOf = (root: string) => path.join(root, ".hardkas", "locks", "append-events.jsonl.lock");
/** Where a recovery lock lives: this version's path first, the first round's second. */
const recoveryPathsOf = (root: string) => [path.join(root, ".hardkas", "locks", "append-events.jsonl.recover.lock"), `${lockPathOf(root)}.recover`];
const ledgerHas = (root: string, eventId: string) => {
  const file = eventLedgerPath(root);
  return fs.existsSync(file) && fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).some((l) => JSON.parse(l).eventId === eventId);
};
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;
const record = (pid: number, name = "append-events.jsonl") =>
  JSON.stringify({ schema: "hardkas.lock.v1", name, pid, command: "test", cwd: os.tmpdir(), hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null });
const waitFor = async (file: string, ms = 15_000) => {
  const deadline = Date.now() + ms;
  while (!fs.existsSync(file) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  if (!fs.existsSync(file)) throw new Error(`timed out waiting for ${file}`);
};
const exited = (child: ChildProcess) => new Promise<void>((resolve) => (child.exitCode !== null ? resolve() : child.once("exit", () => resolve())));
const unchanged = (file: string, bytes: Buffer) => fs.existsSync(file) && fs.readFileSync(file).equals(bytes);

/** emit with the ledger attached; returns the ledger's failure, if any (a non-ledger error is never swallowed). */
const emitWithLedger = (root: string, n: number): { eventId: string; error?: any } => {
  const e = envelope(n);
  const detach = attachLedgerAppender(root);
  try {
    coreEvents.emit(e);
    return { eventId: e.eventId };
  } catch (err) {
    if (isEventLedgerAppendFailure(err)) return { eventId: e.eventId, error: err };
    throw err;
  } finally {
    detach();
  }
};

/** The script of a recoverer that takes every recovery lock in `paths` exactly as the protocol does (wx + record). */
const takeRecoveryLocks = (paths: string[], who: string) =>
  `const fs=require("fs"),os=require("os");const ms=${JSON.stringify(paths)};` +
  `const rec=JSON.stringify({schema:"hardkas.lock.v1",name:"append-events.jsonl.recover",pid:process.pid,command:${JSON.stringify(who)},cwd:os.tmpdir(),hostname:os.hostname(),createdAt:new Date().toISOString(),expiresAt:null});` +
  `const old=new Date(Date.now()-3600000);for(const m of ms){const fd=fs.openSync(m,"wx");fs.writeSync(fd,rec);fs.closeSync(fd);fs.utimesSync(m,old,old);}`;

describe("EVENT-LEDGER-2 closeout · CL-3 a lock naming this process's own pid is held by a live process", () => {
  it("a worker thread of this process holding the append lock is waited for, never taken over; the event lands after it releases", async () => {
    const root = tempRoot();
    const lock = lockPathOf(root);
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    // The other flow: takes the lock exactly as the coordinator does (wx + a hardkas.lock.v1 record naming process.pid,
    // which a worker shares with the main thread), keeps it 1.5 s, then checks it is still the lock it wrote.
    const worker = new Worker(
      `const fs=require("fs"),os=require("os");const {parentPort,workerData}=require("worker_threads");
       const fd=fs.openSync(workerData.lock,"wx");
       const mine=JSON.stringify({schema:"hardkas.lock.v1",name:"append-events.jsonl",pid:process.pid,command:"worker",cwd:os.tmpdir(),hostname:os.hostname(),createdAt:new Date().toISOString(),expiresAt:null});
       fs.writeSync(fd,mine);fs.closeSync(fd);parentPort.postMessage({held:true});
       setTimeout(()=>{let own=false;try{own=fs.readFileSync(workerData.lock,"utf8")===mine}catch{}if(own)fs.unlinkSync(workerData.lock);parentPort.postMessage({ownLockIntact:own});},1500);`,
      { eval: true, workerData: { lock } }
    );
    const messages: any[] = [];
    const held = new Promise<void>((resolve) => worker.on("message", (m) => (messages.push(m), m.held && resolve())));
    const released = new Promise<any>((resolve) => worker.on("message", (m) => "ownLockIntact" in m && resolve(m)));
    try {
      await held;
      const r = emitWithLedger(root, 1);
      const holder = await released;
      expect({ persisted: ledgerHas(root, r.eventId), failure: r.error?.message ?? null, holder }).toEqual({
        persisted: true,
        failure: null,
        holder: { ownLockIntact: true }
      });
    } finally {
      await worker.terminate();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("EVENT-LEDGER-2 closeout · CL-4 a recovery that is still valid is never taken over", () => {
  it("a recoverer that is alive keeps its recovery lock however old it is: the append waits and fails typed, the lock intact", async () => {
    const root = tempRoot();
    const lock = lockPathOf(root);
    const recoveries = recoveryPathsOf(root);
    const ready = path.join(root, "a-ready");
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, record(deadPid())); // an abandoned lock both recoverers will judge
    // Recoverer A: takes the recovery lock with its record, is "suspended" (its lock made an hour old), stays alive 30 s.
    const a = spawn(
      process.execPath,
      ["-e", takeRecoveryLocks(recoveries, "recoverer-A") + `fs.writeFileSync(${JSON.stringify(ready)},"1");setTimeout(()=>{},30000);`],
      { stdio: "ignore" }
    );
    try {
      await waitFor(ready);
      const before = recoveries.map((m) => fs.readFileSync(m));
      const r = emitWithLedger(root, 2);
      const intact = recoveries.every((m, i) => unchanged(m, before[i]!));
      expect({ recoveryLockIntact: intact, typedFailure: r.error !== undefined }).toEqual({ recoveryLockIntact: true, typedFailure: true });
    } finally {
      a.kill();
      await exited(a);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("a recoverer suspended between its check and its unlink never removes the lock of a holder that came after it", async () => {
    const root = tempRoot();
    const lock = lockPathOf(root);
    const recoveries = recoveryPathsOf(root);
    const aChecked = path.join(root, "a-checked");
    const cResult = path.join(root, "c-result.json");
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, record(deadPid()));
    // Recoverer A: recovery lock (record, an hour old), reads the abandoned lock (its check), is suspended 3 s, then
    // unlinks the lock path as its protocol step says, and releases its recovery lock.
    const a = spawn(
      process.execPath,
      [
        "-e",
        takeRecoveryLocks(recoveries, "recoverer-A") +
          `const l=${JSON.stringify(lock)};fs.readFileSync(l);fs.writeFileSync(${JSON.stringify(aChecked)},"1");` +
          `setTimeout(()=>{try{fs.unlinkSync(l)}catch{}for(const m of ms){try{fs.unlinkSync(m)}catch{}}},3000);setTimeout(()=>{},6000);`
      ],
      { stdio: "ignore" }
    );
    // Holder C: takes the lock as soon as it is free, holds it 4 s, then checks it is still the lock it wrote.
    const c = spawn(
      process.execPath,
      [
        "-e",
        `const fs=require("fs"),os=require("os");const l=${JSON.stringify(lock)};` +
          `const mine=JSON.stringify({schema:"hardkas.lock.v1",name:"append-events.jsonl",pid:process.pid,command:"holder-C",cwd:os.tmpdir(),hostname:os.hostname(),createdAt:new Date().toISOString(),expiresAt:null});` +
          `const t0=Date.now();const tick=()=>{try{const fd=fs.openSync(l,"wx");fs.writeSync(fd,mine);fs.closeSync(fd);` +
          `setTimeout(()=>{let own=false;try{own=fs.readFileSync(l,"utf8")===mine}catch{}if(own)fs.unlinkSync(l);fs.writeFileSync(${JSON.stringify(cResult)},JSON.stringify({took:true,ownLockIntact:own}));},4000);}` +
          `catch(e){if(Date.now()-t0>20000){fs.writeFileSync(${JSON.stringify(cResult)},JSON.stringify({took:false}));return;}setTimeout(tick,10);}};tick();`
      ],
      { stdio: "ignore" }
    );
    try {
      await waitFor(aChecked);
      const r = emitWithLedger(root, 3);
      await waitFor(cResult, 30_000);
      const holder = JSON.parse(fs.readFileSync(cResult, "utf8"));
      // C's lock must never be removed by anyone but C; the ledger's event is persisted, or its loss is typed.
      expect({ holder, eventAccounted: ledgerHas(root, r.eventId) || r.error !== undefined }).toEqual({
        holder: { took: true, ownLockIntact: true },
        eventAccounted: true
      });
    } finally {
      for (const p of [a, c]) if (p.exitCode === null) p.kill();
      await Promise.all([exited(a), exited(c)]);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("CL-4c · a recovery lock whose recoverer died fails the append closed — no automatic removal, no wait — until the lock tool clears it", () => {
    const root = tempRoot();
    const lock = lockPathOf(root);
    const [recovery, earlier] = recoveryPathsOf(root) as [string, string];
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, record(deadPid())); // an abandoned append lock
    // what a recoverer that died while recovering it leaves: its recovery lock, naming a pid that is gone
    const leftover = record(deadPid(), "append-events.jsonl.recover");
    fs.writeFileSync(recovery, leftover);
    fs.writeFileSync(earlier, leftover);
    const before = { lock: fs.readFileSync(lock), recovery: fs.readFileSync(recovery), earlier: fs.readFileSync(earlier) };
    try {
      const t0 = Date.now();
      const r = emitWithLedger(root, 4);
      const ms = Date.now() - t0;
      expect({
        cause: r.error?.metadata?.cause?.code,
        persisted: ledgerHas(root, r.eventId),
        intact: { lock: unchanged(lock, before.lock), recovery: unchanged(recovery, before.recovery), earlier: unchanged(earlier, before.earlier) }
      }).toEqual({ cause: "APPEND_LOCK_RECOVERY_BLOCKED", persisted: false, intact: { lock: true, recovery: true, earlier: true } });
      expect(ms, "fails at once: waiting cannot bring a dead recoverer back").toBeLessThan(5_000);
      expect(r.error.message).toContain("hardkas lock clear append-events.jsonl.recover --if-dead");
      expect(r.error.message).toContain(recovery);

      // The administrator's step, with the lock tools: they list the recovery lock, and clear it once its process is gone.
      expect(listLocks(root).map((l) => [l.name, l.isAlive])).toContainEqual(["append-events.jsonl.recover", false]);
      expect(clearLock(root, "append-events.jsonl.recover", { ifDead: true })).toEqual({ cleared: true });
      // Without a recovery lock in the way, the abandoned append lock is recovered automatically, as before.
      const again = emitWithLedger(root, 5);
      expect({ persisted: ledgerHas(root, again.eventId), failure: again.error?.message ?? null, appendLockLeft: fs.existsSync(lock) }).toEqual({
        persisted: true,
        failure: null,
        appendLockLeft: false
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
