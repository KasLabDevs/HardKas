import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  attachLedgerAppender,
  coreEvents,
  createEventEnvelope,
  emitArtifactWritten,
  eventLedgerPath,
  serializeEventForLedger,
  STANDALONE_WORKFLOW_ID
} from "../src/events.js";
import {
  APPEND_LOCK_CREATION_GRACE_MS,
  APPEND_LOCK_WAIT_MS,
  LEGACY_APPEND_LOCK_MIN_AGE_MS,
  appendLockRecord,
  judgeAppendLock
} from "../src/append-coordinator.js";
import { clearLock, listLocks, lockCommandOf } from "../src/lock.js";
import { asArtifactId, asCorrelationId, asEventSequence, asNetworkId, asWorkflowId } from "../src/domain-types.js";

vi.setConfig({ testTimeout: 60_000 });

// EVENT-LEDGER-2 · the workspace event ledger (<root>/events.jsonl) is "the source of truth for the workspace" (core README
// §3) and attachLedgerAppender "guarantees that all formal EventEnvelopes are persisted". It used to lose events with
// nothing said, in two ways:
//  - APPEND-LOCK-STALE-1: AppendCoordinator's lock (.hardkas/locks/append-events.jsonl.lock) had no owner check. A lock left
//    by a holder that died between creating and removing it made every later append spin for 10 s and throw; the ledger
//    appender swallowed the error, so the event was lost and the lock stayed for the next process;
//  - EVENT-EMISSION-1: normalizeAndEmit discarded anything that was not already an envelope (the SDK's tx.signed,
//    artifact.created, the RPC client's rpc.health …), silently.
// Invariants:
//  EL2-I0 HardKAS never reports a clean success after silently losing a formal event that had to persist;
//  EL2-I1 a lock whose holder is gone (a dead process; or an empty / unreadable lock older than the creation grace) never
//         blocks the ledger: the next append recovers it and persists its event, and no stale lock is left behind;
//  EL2-I2 an event offered to the bus is never discarded silently: it reaches the ledger, or the offer fails loudly.
// Controls: a plain append, and a lock held by a LIVE process is waited for (never taken over).
// The first three blocks are the BEFORE tests (red on the base, unchanged); the AFTER blocks pin the mechanism.

const envelope = (n: number) =>
  createEventEnvelope({
    kind: "artifact.written",
    domain: "integrity",
    workflowId: asWorkflowId("wf_el2"),
    correlationId: asCorrelationId("corr_el2"),
    networkId: asNetworkId("simulated"),
    sequenceNumber: asEventSequence(n),
    globalOffset: 0,
    sourceSubsystem: "event-ledger-2-test",
    artifactId: asArtifactId(`el2-artifact-${n}`),
    payload: { artifactId: asArtifactId(`el2-artifact-${n}`), path: `el2-${n}.json` }
  });

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "hk-el2-"));
const lockPathOf = (root: string) => path.join(root, ".hardkas", "locks", "append-events.jsonl.lock");
const ledgerLines = (root: string): string[] => {
  const file = eventLedgerPath(root);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean) : [];
};
const ledgerHas = (root: string, eventId: string) => ledgerLines(root).some((l) => JSON.parse(l).eventId === eventId);
const telemetryLines = (root: string): any[] => {
  const file = path.join(root, ".hardkas", "telemetry", "telemetry.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
};

/** The PID of a process that has already exited: what a crashed holder leaves in its lock. */
const deadPid = (): number => {
  const r = spawnSync(process.execPath, ["-e", ""]);
  return r.pid;
};

/** Writes a leftover lock, as a holder that died would leave it, `ageMs` old. */
const leaveLock = (root: string, content: string, ageMs: number, name = "append-events.jsonl.lock") => {
  const lock = path.join(root, ".hardkas", "locks", name);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, content);
  const t = new Date(Date.now() - ageMs);
  fs.utimesSync(lock, t, t);
  return lock;
};
/** A legacy record (`{pid, time}`, what earlier HardKAS releases wrote) of a dead holder. */
const legacyDead = () => JSON.stringify({ pid: deadPid(), time: new Date(Date.now() - 3_600_000).toISOString() });
/** The record the coordinator writes today, for a given holder. */
const recordFor = (pid: number, hostname = os.hostname()) =>
  JSON.stringify({ ...appendLockRecord("append-events.jsonl"), pid, hostname, createdAt: new Date(Date.now() - 3_600_000).toISOString() });

const withLedger = <T>(root: string, fn: () => T): T => {
  const detach = attachLedgerAppender(root);
  try {
    return fn();
  } finally {
    detach();
  }
};

/** A process that holds the append lock exactly as the coordinator does (wx + record) for `holdMs`, then releases its own file only. */
function spawnHolder(lock: string, holdMs: number, marker: string, record: (pid: number) => string): ChildProcess {
  const code =
    `const fs=require("fs");const lock=${JSON.stringify(lock)};const fd=fs.openSync(lock,"wx");` +
    `const mine=(${record.toString()})(process.pid);fs.writeSync(fd,mine);fs.closeSync(fd);` +
    `fs.writeFileSync(${JSON.stringify(marker)},mine);` +
    `setTimeout(()=>{let own=false;try{own=fs.readFileSync(lock,"utf8")===mine}catch{}` +
    `fs.writeFileSync(${JSON.stringify(marker)}+".done",JSON.stringify({ownLockIntact:own}));if(own)fs.unlinkSync(lock);},${holdMs});`;
  return spawn(process.execPath, ["-e", code], { stdio: "ignore" });
}
const waitFor = async (pred: () => boolean, ms = 10_000) => {
  const deadline = Date.now() + ms;
  while (!pred() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  return pred();
};
const exited = (child: ChildProcess) => new Promise<void>((resolve) => (child.exitCode !== null ? resolve() : child.once("exit", () => resolve())));

describe("EVENT-LEDGER-2 · a lock whose holder is gone never costs an event (EL2-I1)", () => {
  it("a lock left by a dead process is recovered: the next event is persisted and the stale lock does not survive", () => {
    const root = tempRoot();
    try {
      leaveLock(root, legacyDead(), 3_600_000);
      const e = envelope(1);
      withLedger(root, () => coreEvents.emit(e));
      expect({ persisted: ledgerHas(root, e.eventId), staleLockLeft: fs.existsSync(lockPathOf(root)) }).toEqual({
        persisted: true,
        staleLockLeft: false
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["empty (the holder died between creating the lock and writing its owner)", ""],
    ["unreadable (not JSON)", "\u0000\u0000garbage"]
  ])("a lock that is %s and an hour old is recovered and the next event is persisted", (_label, content) => {
    const root = tempRoot();
    try {
      leaveLock(root, content, 3_600_000);
      const e = envelope(2);
      withLedger(root, () => coreEvents.emit(e));
      expect({ persisted: ledgerHas(root, e.eventId), staleLockLeft: fs.existsSync(lockPathOf(root)) }).toEqual({
        persisted: true,
        staleLockLeft: false
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("EVENT-LEDGER-2 · an event offered to the bus is never discarded silently (EL2-I2)", () => {
  it("normalizeAndEmit given a raw event (the shape the SDK's tx.signed site passed) persists it or fails loudly", () => {
    const root = tempRoot();
    try {
      const before = ledgerLines(root).length;
      let threw = false;
      withLedger(root, () => {
        try {
          coreEvents.normalizeAndEmit({ kind: "tx.signed", txId: "el2-raw-tx", network: "simulated", mode: "simulated", amountSompi: "1" });
        } catch {
          threw = true;
        }
      });
      const lines = ledgerLines(root);
      const persisted = lines.length > before && lines.some((l) => l.includes("el2-raw-tx"));
      expect({ persisted, threw }, "the raw event was neither persisted nor rejected").not.toEqual({ persisted: false, threw: false });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("EVENT-LEDGER-2 · controls (must hold before and after)", () => {
  it("a plain envelope with no lock in the way is persisted once", () => {
    const root = tempRoot();
    try {
      const e = envelope(3);
      withLedger(root, () => coreEvents.emit(e));
      expect(ledgerLines(root).filter((l) => JSON.parse(l).eventId === e.eventId)).toHaveLength(1);
      expect(fs.existsSync(lockPathOf(root))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("a lock held by a LIVE process is waited for, never taken over: the event lands after the holder releases it", async () => {
    const root = tempRoot();
    const lock = lockPathOf(root);
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    const marker = path.join(root, "holder-result.json");
    // The holder: takes the lock exactly as AppendCoordinator does (wx + owner record), keeps it 1.5 s, then checks the
    // lock is still the one it wrote before removing it.
    const holder = spawn(
      process.execPath,
      [
        "-e",
        `const fs=require("fs");const lock=${JSON.stringify(lock)};const fd=fs.openSync(lock,"wx");` +
          `const mine=JSON.stringify({pid:process.pid,time:new Date().toISOString()});fs.writeSync(fd,mine);fs.closeSync(fd);` +
          `setTimeout(()=>{let own=false;try{own=fs.readFileSync(lock,"utf8")===mine}catch{}` +
          `fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({ownLockIntact:own}));if(own)fs.unlinkSync(lock);},1500);`
      ],
      { stdio: "ignore" }
    );
    try {
      const deadline = Date.now() + 10_000;
      while (!fs.existsSync(lock) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
      expect(fs.existsSync(lock)).toBe(true);
      const e = envelope(4);
      withLedger(root, () => coreEvents.emit(e));
      await new Promise<void>((resolve) => (holder.exitCode !== null ? resolve() : holder.once("exit", () => resolve())));
      expect({ persisted: ledgerHas(root, e.eventId), holder: JSON.parse(fs.readFileSync(marker, "utf8")) }).toEqual({
        persisted: true,
        holder: { ownLockIntact: true }
      });
    } finally {
      if (holder.exitCode === null) holder.kill();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── AFTER · the mechanism (D1 / D2 / D4 / D7) ───────────────────────────────────────────────────────────────────────

describe("EVENT-LEDGER-2 · AFTER · the append lock is judged before it is touched (D1)", () => {
  it("the record this process writes has the workspace lock shape, and listLocks reads it with real liveness (D7)", () => {
    const record = appendLockRecord("append-events.jsonl");
    expect(record).toMatchObject({
      schema: "hardkas.lock.v1",
      name: "append-events.jsonl",
      pid: process.pid,
      hostname: os.hostname(),
      cwd: process.cwd(),
      command: lockCommandOf(process.argv),
      expiresAt: null
    });
    expect(() => new Date(record.createdAt).toISOString()).not.toThrow();

    const root = tempRoot();
    try {
      leaveLock(root, recordFor(deadPid()), 0);
      const [dead] = listLocks(root);
      expect({ name: dead?.name, isAlive: dead?.isAlive, host: dead?.metadata.hostname }).toEqual({
        name: "append-events.jsonl",
        isAlive: false,
        host: os.hostname()
      });
      fs.writeFileSync(lockPathOf(root), recordFor(process.pid));
      expect(listLocks(root)[0]?.isAlive).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("judgeAppendLock: dead on this host → abandoned; alive → live; another host → unverifiable; legacy/young → live", async () => {
    const root = tempRoot();
    const lock = lockPathOf(root);
    const judge = () => {
      const v = judgeAppendLock(lock);
      return v.state;
    };
    const live = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 20000)"], { stdio: "ignore" });
    try {
      leaveLock(root, recordFor(deadPid()), 0);
      expect(judge(), "a dead pid on this host, whatever the age").toBe("abandoned");
      fs.writeFileSync(lock, recordFor(live.pid!));
      expect(judge(), "a running pid on this host").toBe("live");
      fs.writeFileSync(lock, recordFor(deadPid(), `${os.hostname()}-elsewhere`));
      expect(judge(), "another host: never recovered, waited for").toBe("unverifiable");
      fs.writeFileSync(lock, recordFor(process.pid));
      // closeout CL-3 (reviewer): a record naming this live process is another of its flows' lock — waited for, never taken over
      expect(judge(), "a record naming this process: held by a live process").toBe("live");

      leaveLock(root, legacyDead(), 0);
      expect(judge(), `a legacy record younger than ${LEGACY_APPEND_LOCK_MIN_AGE_MS} ms cannot be placed on a host`).toBe("live");
      leaveLock(root, legacyDead(), LEGACY_APPEND_LOCK_MIN_AGE_MS + 1_000);
      expect(judge(), "a legacy record old enough whose pid is dead here").toBe("abandoned");
      leaveLock(root, JSON.stringify({ pid: live.pid, time: new Date().toISOString() }), 3_600_000);
      expect(judge(), "a legacy record of a live pid, however old").toBe("live");

      leaveLock(root, "", 0);
      expect(judge(), "an empty file within the creation grace: a holder writing its record").toBe("live");
      leaveLock(root, "", APPEND_LOCK_CREATION_GRACE_MS + 500);
      expect(judge(), "an empty file past the creation grace").toBe("abandoned");
      leaveLock(root, "garbage{", APPEND_LOCK_CREATION_GRACE_MS + 500);
      expect(judge(), "an unreadable file past the creation grace").toBe("abandoned");
      fs.unlinkSync(lock);
      expect(judge()).toBe("gone");
    } finally {
      live.kill();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("a recovery is recorded: a STALE_LOCK_RECOVERY anomaly in the workspace telemetry names the lock", () => {
    const root = tempRoot();
    try {
      leaveLock(root, recordFor(deadPid()), 0);
      const e = envelope(10);
      withLedger(root, () => coreEvents.emit(e));
      const anomalies = telemetryLines(root).filter((t) => t.type === "STALE_LOCK_RECOVERY");
      expect(anomalies.length, "one recovery, one anomaly").toBe(1);
      expect(anomalies[0].payload.details).toContain("append-events.jsonl.lock");
      expect(anomalies[0].payload.subsystem).toBe("lock");
      expect({ persisted: ledgerHas(root, e.eventId), lockLeft: fs.existsSync(lockPathOf(root)) }).toEqual({ persisted: true, lockLeft: false });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("closeout CL-4 (reviewer, fail closed): an empty recovery lock left by a recoverer that died is never removed automatically; the append fails typed until the lock tool clears it", () => {
    const root = tempRoot();
    try {
      const lock = leaveLock(root, recordFor(deadPid()), 0);
      const lockBytes = fs.readFileSync(lock);
      // the recovery lock where this version keeps it, and where the closeout's first round kept it (`<lock>.recover`),
      // so the same test judges both: an empty one past the creation grace is a recoverer that died before its record
      const recovery = leaveLock(root, "", 60_000, "append-events.jsonl.recover.lock");
      const earlier = leaveLock(root, "", 60_000, "append-events.jsonl.lock.recover");
      const e = envelope(11);
      let failure: any;
      try {
        withLedger(root, () => coreEvents.emit(e));
      } catch (err) {
        failure = err;
      }
      expect({
        code: failure?.code,
        cause: failure?.metadata?.cause?.code,
        persisted: ledgerHas(root, e.eventId),
        lockIntact: fs.existsSync(lock) && fs.readFileSync(lock).equals(lockBytes),
        recoveryLeft: fs.existsSync(recovery),
        earlierLeft: fs.existsSync(earlier)
      }).toEqual({ code: "EVENT_LEDGER_APPEND_FAILED", cause: "APPEND_LOCK_RECOVERY_BLOCKED", persisted: false, lockIntact: true, recoveryLeft: true, earlierLeft: true });
      expect(failure.message, "an empty recovery lock names no process to check").toContain("hardkas lock clear append-events.jsonl.recover --force");
      // the administrator's step; the next append then recovers the abandoned append lock by itself
      expect(clearLock(root, "append-events.jsonl.recover", { force: true })).toEqual({ cleared: true });
      const e2 = envelope(13);
      withLedger(root, () => coreEvents.emit(e2));
      expect({ persisted: ledgerHas(root, e2.eventId), lockLeft: fs.existsSync(lock) }).toEqual({ persisted: true, lockLeft: false });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("the same recovery serves the telemetry appends (D6): a dead telemetry lock is recovered and the anomaly lands", () => {
    const root = tempRoot();
    try {
      const telemetryLock = leaveLock(root, legacyDead(), 3_600_000, "append-telemetry.jsonl.lock");
      leaveLock(root, recordFor(deadPid()), 0); // the events lock: its recovery logs an anomaly through the telemetry
      const e = envelope(12);
      const t0 = Date.now();
      withLedger(root, () => coreEvents.emit(e));
      const ms = Date.now() - t0;
      const recoveries = telemetryLines(root).filter((t) => t.type === "STALE_LOCK_RECOVERY").map((t) => String(t.payload.details));
      expect(ms, "no 10 s wait on either lock").toBeLessThan(APPEND_LOCK_WAIT_MS / 2);
      expect({ telemetryLockLeft: fs.existsSync(telemetryLock), persisted: ledgerHas(root, e.eventId) }).toEqual({ telemetryLockLeft: false, persisted: true });
      expect(recoveries.some((d) => d.includes("append-events.jsonl.lock"))).toBe(true);
      expect(recoveries.some((d) => d.includes("append-telemetry.jsonl.lock")), "the telemetry lock's own recovery is recorded too").toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("EVENT-LEDGER-2 · AFTER · no silent loss (D2, EL2-I0)", () => {
  it("a raw event is refused with EVENT_ENVELOPE_INVALID and reaches no listener and no ledger", () => {
    const root = tempRoot();
    try {
      const seen: unknown[] = [];
      const off = coreEvents.on((e) => seen.push(e));
      try {
        withLedger(root, () => {
          expect(() => coreEvents.normalizeAndEmit({ kind: "artifact.created", artifactId: "x", path: "y" })).toThrowError(
            expect.objectContaining({ code: "EVENT_ENVELOPE_INVALID" })
          );
        });
      } finally {
        off();
      }
      expect({ seen, ledger: ledgerLines(root) }).toEqual({ seen: [], ledger: [] });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("when the ledger cannot be written, emit throws EVENT_LEDGER_APPEND_FAILED: the evidence failed, the effect is named as possible, nothing is spooled", () => {
    const root = tempRoot();
    try {
      fs.mkdirSync(eventLedgerPath(root), { recursive: true }); // the ledger path is a directory: no append can succeed
      const e = envelope(20);
      let failure: any;
      withLedger(root, () => {
        try {
          coreEvents.emit(e);
        } catch (err) {
          failure = err;
        }
      });
      expect(failure?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
      expect(failure.event).toEqual({
        kind: "artifact.written",
        eventId: e.eventId,
        workflowId: "wf_el2",
        artifactId: "el2-artifact-20",
        path: "el2-20.json"
      });
      expect(failure.ledgerPath).toBe(eventLedgerPath(root));
      // the two facts, apart: evidence not persisted / effect (the artifact write) already done
      expect(failure.message).toContain("could not be recorded in");
      expect(failure.message).toContain("WAS written at el2-20.json");
      expect(failure.message).toContain("Nothing was spooled");
      expect(failure.metadata.event.artifactId).toBe("el2-artifact-20");
      expect(typeof failure.metadata.cause.message).toBe("string");
      expect(fs.readdirSync(root).filter((f) => f !== "events.jsonl" && f !== ".hardkas"), "no spool file anywhere").toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("a transaction event that could not be recorded names its txId and says the transaction may have been submitted", () => {
    const root = tempRoot();
    try {
      fs.mkdirSync(eventLedgerPath(root), { recursive: true });
      const e = createEventEnvelope({
        kind: "workflow.receipt",
        domain: "workflow",
        workflowId: asWorkflowId("wf_el2"),
        correlationId: asCorrelationId("wf_el2"),
        networkId: asNetworkId("simulated"),
        sequenceNumber: asEventSequence(6),
        sourceSubsystem: "event-ledger-2-test",
        txId: "tx-el2-receipt" as any,
        payload: { txId: "tx-el2-receipt" as any, status: "accepted" }
      });
      let failure: any;
      withLedger(root, () => {
        try {
          coreEvents.emit(e);
        } catch (err) {
          failure = err;
        }
      });
      expect(failure?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
      expect(failure.event.txId).toBe("tx-el2-receipt");
      expect(failure.message).toContain("Transaction tx-el2-receipt may already have been executed or submitted");
      expect(failure.message).toContain("hardkas tx status tx-el2-receipt");
      expect(failure.message).not.toMatch(/succeeded|was sent successfully/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("a failed event is not marked as seen: once the ledger can be written again, emitting it again persists it once", () => {
    const root = tempRoot();
    try {
      fs.mkdirSync(eventLedgerPath(root), { recursive: true });
      const e = envelope(21);
      withLedger(root, () => {
        expect(() => coreEvents.emit(e)).toThrowError(expect.objectContaining({ code: "EVENT_LEDGER_APPEND_FAILED" }));
        fs.rmdirSync(eventLedgerPath(root));
        coreEvents.emit(e);
        coreEvents.emit(e); // idempotent within the attachment once persisted
      });
      expect(ledgerLines(root).filter((l) => JSON.parse(l).eventId === e.eventId)).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("a listener's own failure never reaches the emitter (fire-and-forget kept) and the event is still persisted", () => {
    const root = tempRoot();
    const off = coreEvents.on(() => {
      throw new Error("an observer failed");
    });
    try {
      const e = envelope(22);
      withLedger(root, () => expect(() => coreEvents.emit(e)).not.toThrow());
      expect(ledgerHas(root, e.eventId)).toBe(true);
    } finally {
      off();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("a live holder past the wait: typed failure naming the holder, in about the wait, and the holder's lock is never taken over", async () => {
    const root = tempRoot();
    const lock = lockPathOf(root);
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    const marker = path.join(root, "holder.txt");
    const holder = spawnHolder(lock, APPEND_LOCK_WAIT_MS + 5_000, marker, (pid: number) =>
      JSON.stringify({ schema: "hardkas.lock.v1", name: "append-events.jsonl", pid, command: "holder", cwd: "", hostname: require("os").hostname(), createdAt: new Date().toISOString(), expiresAt: null })
    );
    try {
      expect(await waitFor(() => fs.existsSync(marker))).toBe(true);
      const mine = fs.readFileSync(marker, "utf8");
      const e = envelope(23);
      const t0 = Date.now();
      let failure: any;
      withLedger(root, () => {
        try {
          coreEvents.emit(e);
        } catch (err) {
          failure = err;
        }
      });
      const ms = Date.now() - t0;
      expect(failure?.code).toBe("EVENT_LEDGER_APPEND_FAILED");
      expect(failure.metadata.cause.code).toBe("APPEND_LOCK_TIMEOUT");
      expect(failure.message).toContain(`process ${holder.pid}`);
      expect(ms).toBeGreaterThanOrEqual(APPEND_LOCK_WAIT_MS - 200);
      expect(ms).toBeLessThan(APPEND_LOCK_WAIT_MS + 4_000);
      expect({ holderLockIntact: fs.existsSync(lock) && fs.readFileSync(lock, "utf8") === mine, persisted: ledgerHas(root, e.eventId) }).toEqual({
        holderLockIntact: true,
        persisted: false
      });
      await exited(holder);
      expect(JSON.parse(fs.readFileSync(`${marker}.done`, "utf8"))).toEqual({ ownLockIntact: true });
    } finally {
      if (holder.exitCode === null) holder.kill();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("bigint payload values (workflow.plan.created's amountSompi) are persisted as decimal strings instead of being lost", () => {
    const root = tempRoot();
    try {
      const e = createEventEnvelope({
        kind: "workflow.plan.created",
        domain: "workflow",
        workflowId: asWorkflowId("wf_el2"),
        correlationId: asCorrelationId("wf_el2"),
        networkId: asNetworkId("simulated"),
        sequenceNumber: asEventSequence(2),
        sourceSubsystem: "event-ledger-2-test",
        payload: { planId: asArtifactId("plan-el2"), network: asNetworkId("simulated"), amountSompi: 123_456_789n }
      });
      expect(() => JSON.stringify(e), "precondition: the envelope is not plain-JSON serializable").toThrow();
      expect(JSON.parse(serializeEventForLedger(e)).payload.amountSompi).toBe("123456789");
      withLedger(root, () => coreEvents.emit(e));
      const line = ledgerLines(root).map((l) => JSON.parse(l)).find((l) => l.eventId === e.eventId);
      expect(line?.payload).toEqual({ planId: "plan-el2", network: "simulated", amountSompi: "123456789" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("EVENT-LEDGER-2 · AFTER · the one artifact announcement boundary (D4)", () => {
  it("emitArtifactWritten emits the artifact.written envelope: identity = the artifact id, correlation = its own workflowId or the standalone marker", () => {
    const root = tempRoot();
    try {
      const seen: any[] = [];
      const off = coreEvents.on((e) => seen.push(e));
      try {
        withLedger(root, () => {
          emitArtifactWritten({ artifactId: "a".repeat(64), absolutePath: path.join(root, "a.json"), sourceSubsystem: "el2-test", workflowId: "wf_own", networkId: "simulated" });
          emitArtifactWritten({ artifactId: "b".repeat(64), absolutePath: path.join(root, "b.json"), sourceSubsystem: "el2-test" });
        });
      } finally {
        off();
      }
      expect(seen.map((e) => [e.kind, e.domain, e.workflowId, e.correlationId, e.networkId, e.artifactId, e.payload.artifactId, e.sourceSubsystem])).toEqual([
        ["artifact.written", "integrity", "wf_own", "wf_own", "simulated", "a".repeat(64), "a".repeat(64), "el2-test"],
        ["artifact.written", "integrity", STANDALONE_WORKFLOW_ID, STANDALONE_WORKFLOW_ID, "unknown", "b".repeat(64), "b".repeat(64), "el2-test"]
      ]);
      expect(ledgerLines(root).map((l) => JSON.parse(l).payload.path)).toEqual([path.join(root, "a.json"), path.join(root, "b.json")]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
