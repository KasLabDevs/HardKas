import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { attachLedgerAppender, coreEvents, createEventEnvelope, eventLedgerPath } from "../src/events.js";
import { asArtifactId, asCorrelationId, asEventSequence, asNetworkId, asWorkflowId } from "../src/domain-types.js";

vi.setConfig({ testTimeout: 60_000 });

// EVENT-LEDGER-2 · the workspace event ledger (<root>/events.jsonl) is "the source of truth for the workspace" (core README
// §3) and attachLedgerAppender "guarantees that all formal EventEnvelopes are persisted". Today it loses events with nothing
// said, in two ways:
//  - APPEND-LOCK-STALE-1: AppendCoordinator's lock (.hardkas/locks/append-events.jsonl.lock) has no owner check. A lock left
//    by a holder that died between creating and removing it makes every later append spin for 10 s and throw; the ledger
//    appender swallows the error, so the event is lost and the lock stays for the next process;
//  - EVENT-EMISSION-1: normalizeAndEmit discards anything that is not already an envelope (the SDK's tx.signed,
//    artifact.created, the RPC client's rpc.health …), silently.
// Invariants:
//  EL2-I1 a lock whose holder is gone (a dead process; or an empty / unreadable lock older than the creation grace) never
//         blocks the ledger: the next append recovers it and persists its event, and no stale lock is left behind;
//  EL2-I2 an event offered to the bus is never discarded silently: it reaches the ledger, or the offer fails loudly.
// Controls: a plain append, and a lock held by a LIVE process is waited for (never taken over).

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

/** The PID of a process that has already exited: what a crashed holder leaves in its lock. */
const deadPid = (): number => {
  const r = spawnSync(process.execPath, ["-e", ""]);
  return r.pid;
};

/** Writes a leftover lock, as a holder that died would leave it, `ageMs` old. */
const leaveLock = (root: string, content: string, ageMs: number) => {
  const lock = lockPathOf(root);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, content);
  const t = new Date(Date.now() - ageMs);
  fs.utimesSync(lock, t, t);
};

const withLedger = <T>(root: string, fn: () => T): T => {
  const detach = attachLedgerAppender(root);
  try {
    return fn();
  } finally {
    detach();
  }
};

describe("EVENT-LEDGER-2 · a lock whose holder is gone never costs an event (EL2-I1)", () => {
  it("a lock left by a dead process is recovered: the next event is persisted and the stale lock does not survive", () => {
    const root = tempRoot();
    try {
      leaveLock(root, JSON.stringify({ pid: deadPid(), time: new Date(Date.now() - 3_600_000).toISOString() }), 3_600_000);
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
  it("normalizeAndEmit given a raw event (the shape the SDK's tx.signed site passes) persists it or fails loudly", () => {
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
