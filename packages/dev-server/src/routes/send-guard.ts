// P0-TX-SAFETY-1A: the dev server's `POST /api/tx/send` never turns an unknown outcome into another transaction.
//
// The auto-sign path plans and signs a NEW transaction on every request. Before this guard, a request repeated after
// an ambiguous answer (a client retry, a reload, a second click) planned, signed and broadcast a second transaction —
// a second txId for the same payment. The guard keeps, per workspace:
//  - by idempotency key: the request's fingerprint (a hash of the WHOLE request and the network) and its recorded
//    answer. The same key with the same request returns that answer (nothing is planned, signed or sent again); the
//    same key with any other request is refused; a key whose request is still running is refused. Keys are never
//    forgotten: when the store is full, new keyed requests are refused instead.
//  - by payment (network, from, to, amount, feeRate): every send whose outcome is unknown. Each new auto-signed
//    payment with the same terms is refused unless the request itself says a new payment is intended
//    (`allowNewPaymentAfterUnknown: true`). Another payment completing never resolves an earlier unknown one.
//
// Hardening (owner review 2026-10-18): the state is a hash-chained, append-only log in the workspace
// (`.hardkas/dev-server/send-guard.v1.jsonl`), written and fsynced BEFORE anything is planned and again, with the
// txId, BEFORE the broadcast. After a restart it is replayed: a send that began and never finished is an unknown
// outcome. A log that cannot be read, does not verify (edited, reordered, truncated mid-line) or cannot be written
// makes the guard UNAVAILABLE: every broadcasting send is refused (fail closed) until the log is repaired. The
// simulator, which broadcasts nothing, is not blocked by an unavailable guard.

import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export type SendOutcome = "accepted" | "rejected" | "unknown" | "executed";

export interface RecordedAnswer {
  status: number;
  body: unknown;
}

export const SEND_GUARD_LOG = path.join(".hardkas", "dev-server", "send-guard.v1.jsonl");
/**
 * P0-TX-SAFETY integration (multi-process) + LOCK-RACE-1: ONE guard owns a physical workspace's send guard. The lock
 * holds its pid and a random nonce and is only ever CREATED exclusively (`wx`) — never removed by a process that did
 * not create it. Another live process (or another guard in this process) gets no broadcasting send. A lock whose pid is
 * no longer running is STALE and is NOT taken over automatically: removing it safely would need a compare-and-delete
 * that the file system does not offer portably (a second recoverer could delete the first one's fresh lock), so sends
 * are refused until a controlled recovery (`recoverStaleSendGuardLock`) archives it, keeping it as evidence. The owner
 * re-reads the lock before every broadcast and stops sending if it no longer names it. A pid that cannot be checked
 * counts as alive (fail closed).
 */
export const SEND_GUARD_LOCK = path.join(".hardkas", "dev-server", "send-guard.v1.lock");
const LOG_SCHEMA = "hardkas.devServerSendGuard.v1";
const GENESIS = "0".repeat(64);
export const MAX_IDEMPOTENCY_KEYS = 10_000;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

/** Refusals raised before anything left the process (nothing was broadcast). Any other failure after signing is unknown. */
export const NOT_SENT_CODES: ReadonlySet<string> = new Set([
  "SUBMIT_NOT_SENT",
  "NODE_NETWORK_MISMATCH",
  "NODE_NETWORK_UNKNOWN",
  "MAINNET_BROADCAST_DISABLED",
  "MAINNET_SIGNING_DISABLED",
  "SEND_NETWORK_MISMATCH",
  "SEND_ENDPOINT_ON_SIMULATOR",
  "SIGNED_PLAN_MISMATCH",
  "SUBMISSION_UNIDENTIFIED_SIGNED",
  "NETWORK_ENDPOINT_REQUIRED"
]);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** The whole request except its key, and the network: any difference is another request. */
export function sendFingerprint(body: any, network: string): string {
  const { idempotencyKey: _k, ...rest } = (body ?? {}) as Record<string, unknown>;
  return sha256(canonical({ network, request: rest }));
}

/** The payment an auto-signed request would create; undefined for a request that sends an existing signed tx. */
export function paymentKey(body: any, network: string): string | undefined {
  if (!(body?.from && body?.to && body?.amountSompi)) return undefined;
  return canonical({
    network,
    from: String(body.from),
    to: String(body.to),
    amountSompi: String(body.amountSompi),
    feeRate: body.feeRate === undefined || body.feeRate === null ? null : String(body.feeRate)
  });
}

export type KeyCheck = { ok: true; key: string | undefined } | { ok: false; message: string };

export function checkIdempotencyKey(body: any): KeyCheck {
  if (!body || !Object.prototype.hasOwnProperty.call(body, "idempotencyKey") || body.idempotencyKey === undefined) {
    return { ok: true, key: undefined };
  }
  const k = body.idempotencyKey;
  if (typeof k !== "string" || !KEY_PATTERN.test(k)) {
    return {
      ok: false,
      message: "idempotencyKey must be 1 to 200 characters of A-Z a-z 0-9 . _ : - ; nothing was planned, signed or sent."
    };
  }
  return { ok: true, key: k };
}

export function idempotencyKeyOf(body: any): string | undefined {
  const c = checkIdempotencyKey(body);
  return c.ok ? c.key : undefined;
}

export type Admission =
  | { kind: "proceed" }
  | { kind: "replay"; answer: RecordedAnswer }
  | { kind: "refuse"; code: string; message: string; txId?: string };

interface Pending {
  seq: number;
  key: string | undefined;
  fingerprint: string;
  payment: string | undefined;
  txId?: string;
}

type LogEvent =
  | { op: "begin"; seq: number; key?: string; fingerprint: string; payment?: string; at: string }
  | { op: "signed"; seq: number; txId: string; at: string }
  | { op: "finish"; seq: number; outcome: SendOutcome; txId?: string; answer: RecordedAnswer; at: string }
  | { op: "abandon"; seq: number; at: string };

class SendGuard {
  private readonly file: string;
  private unavailable: string | undefined;
  private head = GENESIS;
  private nextSeq = 1;
  private readonly byKey = new Map<string, { fingerprint: string; state: "in-flight" | "done"; answer?: RecordedAnswer }>();
  private readonly unknownByPayment = new Map<string, Array<{ txId: string | undefined; seq: number }>>();
  private readonly inFlight = new Map<number, Pending>();
  private readonly lockFile: string;
  private owner = false;
  private ownerConflict: string | undefined;
  private ownerStale: number | undefined;

  constructor(root: string) {
    this.file = path.join(root, SEND_GUARD_LOG);
    this.lockFile = path.join(root, SEND_GUARD_LOCK);
    this.ensureOwner();
    this.load();
  }

  private readonly nonce = randomBytes(16).toString("hex");

  /** Become (or stay) the owner of this workspace's guard. Returns whether this guard owns it. Never removes a lock. */
  private ensureOwner(): boolean {
    if (this.owner) return this.stillOwner();
    const wasConflict = this.ownerConflict !== undefined;
    try {
      fs.mkdirSync(path.dirname(this.lockFile), { recursive: true });
    } catch (e: any) {
      this.unavailable = `the send-guard directory ${path.dirname(this.lockFile)} cannot be created (${e?.message ?? String(e)})`;
      return false;
    }
    try {
      const fd = fs.openSync(this.lockFile, "wx");
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, nonce: this.nonce, at: new Date().toISOString() }));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      this.takeOwnership(wasConflict);
      return true;
    } catch (e: any) {
      if (e?.code !== "EEXIST") {
        // not another owner: the guard cannot record at all (same fail-closed answer as an unwritable log)
        this.unavailable = `the send-guard lock ${this.lockFile} cannot be created (${e?.message ?? String(e)})`;
        return false;
      }
    }
    const held = readLockFile(this.lockFile);
    this.ownerStale = undefined;
    if (held === undefined || typeof held.pid !== "number") {
      this.ownerConflict = `the send-guard lock ${this.lockFile} names no process that can be checked`;
    } else if (held.pid === process.pid) {
      this.ownerConflict = `another send guard in this process owns ${this.lockFile} (the same workspace opened twice)`;
    } else if (isRunning(held.pid)) {
      this.ownerConflict = `another dev-server process (pid ${held.pid}) owns the send guard of this workspace (${this.lockFile})`;
    } else {
      this.ownerStale = held.pid;
      this.ownerConflict =
        `the send-guard lock ${this.lockFile} names pid ${held.pid}, which is no longer running (stale). It is not removed ` +
        `automatically: stop every dev server on this workspace, then recover it under control ` +
        `(recoverStaleSendGuardLock(root, { pid: ${held.pid} }) archives it as evidence) and start one dev server`;
    }
    return false;
  }

  /** The lock still names this guard (pid and nonce). Read before every broadcast; losing it stops the sends. */
  private stillOwner(): boolean {
    const held = readLockFile(this.lockFile);
    if (held !== undefined && held.pid === process.pid && held.nonce === this.nonce) return true;
    this.owner = false;
    releaseHeld(this.lockFile, this.nonce, false);
    this.ownerConflict = `this process no longer holds the send-guard lock ${this.lockFile} (it was removed or replaced)`;
    return false;
  }

  private takeOwnership(reload: boolean): void {
    this.owner = true;
    this.ownerConflict = undefined;
    this.ownerStale = undefined;
    holdLock(this.lockFile, this.nonce);
    if (reload) {
      // the previous owner may have appended since this process last read the log
      this.byKey.clear();
      this.unknownByPayment.clear();
      this.head = GENESIS;
      this.unavailable = undefined;
      this.load();
    }
  }

  private load(): void {
    let text: string;
    try {
      if (!fs.existsSync(this.file)) return;
      text = fs.readFileSync(this.file, "utf8");
    } catch (e) {
      this.unavailable = `the send-guard log ${this.file} cannot be read (${e instanceof Error ? e.message : String(e)})`;
      return;
    }
    const lines = text.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    const pending = new Map<number, Pending>();
    let lineNo = 0;
    for (const line of lines) {
      lineNo++;
      let rec: any;
      try {
        rec = JSON.parse(line);
      } catch {
        this.unavailable = `the send-guard log ${this.file} is damaged at line ${lineNo} (not JSON: truncated or edited)`;
        return;
      }
      const { hash, ...unsigned } = rec ?? {};
      if (rec?.schema !== LOG_SCHEMA || rec.prev !== this.head || typeof hash !== "string" || sha256(canonical(unsigned)) !== hash) {
        this.unavailable = `the send-guard log ${this.file} does not verify at line ${lineNo} (hash chain broken: edited, reordered or from another log)`;
        return;
      }
      this.head = hash;
      const ev = rec.event as LogEvent;
      this.nextSeq = Math.max(this.nextSeq, ev.seq + 1);
      if (ev.op === "begin") {
        const p: Pending = { seq: ev.seq, key: ev.key, fingerprint: ev.fingerprint, payment: ev.payment };
        pending.set(ev.seq, p);
        if (ev.key !== undefined) this.byKey.set(ev.key, { fingerprint: ev.fingerprint, state: "in-flight" });
      } else if (ev.op === "signed") {
        const p = pending.get(ev.seq);
        if (p) p.txId = ev.txId;
      } else if (ev.op === "finish") {
        const p = pending.get(ev.seq);
        pending.delete(ev.seq);
        if (!p) continue;
        if (p.key !== undefined) this.byKey.set(p.key, { fingerprint: p.fingerprint, state: "done", answer: ev.answer });
        if (ev.outcome === "unknown" && p.payment !== undefined) this.addUnknown(p.payment, ev.txId ?? p.txId, p.seq);
      } else if (ev.op === "abandon") {
        const p = pending.get(ev.seq);
        pending.delete(ev.seq);
        if (p?.key !== undefined) this.byKey.delete(p.key);
      }
    }
    // A send that began and never finished (the process stopped mid-send): its outcome is unknown. Its key cannot
    // be replayed (no recorded answer) and stays refused as in progress; its payment is blocked like any unknown one.
    for (const p of pending.values()) {
      if (p.payment !== undefined) this.addUnknown(p.payment, p.txId, p.seq);
    }
  }

  private addUnknown(payment: string, txId: string | undefined, seq: number): void {
    const list = this.unknownByPayment.get(payment) ?? [];
    list.push({ txId, seq });
    this.unknownByPayment.set(payment, list);
  }

  private append(event: LogEvent): void {
    const unsigned = { schema: LOG_SCHEMA, prev: this.head, event };
    const hash = sha256(canonical(unsigned));
    const line = JSON.stringify({ ...unsigned, hash }) + "\n";
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const fd = fs.openSync(this.file, "a");
    try {
      fs.writeSync(fd, line);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.head = hash;
  }

  /** Append, or turn the guard UNAVAILABLE (fail closed) and say so. */
  private tryAppend(event: LogEvent): string | undefined {
    // only the owner writes the log (a non-owner runs only simulator sends, kept in memory)
    if (!this.owner) return this.ownerConflict ?? "this process does not own the send guard";
    try {
      this.append(event);
      return undefined;
    } catch (e) {
      this.unavailable = `the send-guard log ${this.file} cannot be written (${e instanceof Error ? e.message : String(e)})`;
      return this.unavailable;
    }
  }

  private unavailableRefusal(): Admission {
    return {
      kind: "refuse",
      code: "SEND_GUARD_UNAVAILABLE",
      message:
        `Sends are refused: ${this.unavailable}. Without that record HardKAS cannot tell whether an earlier send of the same ` +
        "payment has an unknown outcome, so nothing was planned, signed or sent. Inspect or move the log aside deliberately to continue."
    };
  }

  admit(body: any, network: string, broadcasts: boolean): Admission {
    const keyCheck = checkIdempotencyKey(body);
    if (!keyCheck.ok) return { kind: "refuse", code: "IDEMPOTENCY_KEY_INVALID", message: keyCheck.message };
    if (broadcasts && !this.ensureOwner()) {
      if (this.ownerConflict === undefined) return this.unavailableRefusal();
      return {
        kind: "refuse",
        code: this.ownerStale !== undefined ? "SEND_GUARD_LOCK_STALE" : "SEND_GUARD_OWNED_BY_OTHER_PROCESS",
        message:
          `Broadcasting sends are refused in this process: ${this.ownerConflict}. Two dev servers on one workspace cannot ` +
          "coordinate idempotency or unknown outcomes, so nothing was planned, signed or sent here. Stop the other dev server, or use it."
      };
    }
    if (this.unavailable !== undefined && broadcasts) return this.unavailableRefusal();
    const key = keyCheck.key;
    const fingerprint = sendFingerprint(body, network);
    if (key !== undefined) {
      const entry = this.byKey.get(key);
      if (entry) {
        if (entry.fingerprint !== fingerprint) {
          return {
            kind: "refuse",
            code: "IDEMPOTENCY_KEY_REUSED",
            message: `idempotencyKey ${key} was used for a different send request; nothing was planned, signed or sent.`
          };
        }
        if (entry.state === "in-flight" || !entry.answer) {
          return {
            kind: "refuse",
            code: "TX_SEND_IN_PROGRESS",
            message:
              `A send with idempotencyKey ${key} has no recorded answer (still running, or the dev server stopped during it); ` +
              "nothing new was planned, signed or sent. Observe the transaction instead of sending it again."
          };
        }
        return { kind: "replay", answer: entry.answer };
      }
      if (this.byKey.size >= MAX_IDEMPOTENCY_KEYS) {
        return {
          kind: "refuse",
          code: "IDEMPOTENCY_STORE_FULL",
          message: `The send-guard holds ${MAX_IDEMPOTENCY_KEYS} idempotency keys and never forgets one; nothing was planned, signed or sent.`
        };
      }
    }
    const payment = paymentKey(body, network);
    if (payment !== undefined) {
      for (const p of this.inFlight.values()) {
        if (p.payment === payment) {
          return {
            kind: "refuse",
            code: "TX_SEND_IN_PROGRESS",
            message: "An auto-signed send for the same payment (from, to, amount) is still running; nothing new was planned, signed or sent."
          };
        }
      }
      const prior = this.unknownByPayment.get(payment);
      if (prior && prior.length > 0 && body?.allowNewPaymentAfterUnknown !== true) {
        const txIds = prior.map((u) => u.txId).filter((t): t is string => typeof t === "string");
        return {
          kind: "refuse",
          code: "PRIOR_SEND_OUTCOME_UNKNOWN",
          message:
            `${prior.length} earlier send(s) of the same payment${txIds.length ? ` (transaction ${txIds.join(", ")})` : ""} have an ` +
            "unknown outcome: the node may have them. Nothing was planned, signed or sent. Resolve them by observing those " +
            "transactions (GET /api/tx/receipt/<txId>, `hardkas tx wait <txId>`); to pay again anyway, send " +
            "allowNewPaymentAfterUnknown: true with this request.",
          ...(txIds.length ? { txId: txIds[txIds.length - 1] } : {})
        };
      }
    }
    return { kind: "proceed" };
  }

  /** Recorded (fsynced) before anything is planned. A failure to record refuses the send. */
  begin(body: any, network: string, broadcasts = true): { ok: true; pending: Pending } | { ok: false; refusal: Admission } {
    const key = idempotencyKeyOf(body);
    const p: Pending = { seq: this.nextSeq++, key, fingerprint: sendFingerprint(body, network), payment: paymentKey(body, network) };
    const failed = this.tryAppend({
      op: "begin",
      seq: p.seq,
      ...(key !== undefined ? { key } : {}),
      fingerprint: p.fingerprint,
      ...(p.payment !== undefined ? { payment: p.payment } : {}),
      at: new Date().toISOString()
    });
    // the simulator broadcasts nothing: an unrecordable guard does not block it (its idempotency is then in memory only)
    if (failed !== undefined && broadcasts) return { ok: false, refusal: this.unavailableRefusal() };
    this.inFlight.set(p.seq, p);
    if (key !== undefined) this.byKey.set(key, { fingerprint: p.fingerprint, state: "in-flight" });
    return { ok: true, pending: p };
  }

  /** Recorded (fsynced) with the txId BEFORE the broadcast; false = not recorded, so the caller must not broadcast. */
  signed(p: Pending, txId: string): boolean {
    p.txId = txId;
    // LOCK-RACE-1: still the owner right before the broadcast, or nothing is broadcast
    if (!this.ensureOwner()) return false;
    return this.tryAppend({ op: "signed", seq: p.seq, txId, at: new Date().toISOString() }) === undefined;
  }

  finish(p: Pending, outcome: SendOutcome, txId: string | undefined, answer: RecordedAnswer): void {
    this.inFlight.delete(p.seq);
    // the memory follows even if the record fails: the guard is then unavailable and refuses later sends anyway
    this.tryAppend({ op: "finish", seq: p.seq, outcome, ...(txId ? { txId } : {}), answer, at: new Date().toISOString() });
    if (p.key !== undefined) this.byKey.set(p.key, { fingerprint: p.fingerprint, state: "done", answer });
    // an unknown outcome is added, never cleared by another payment's result
    if (outcome === "unknown" && p.payment !== undefined) this.addUnknown(p.payment, txId ?? p.txId, p.seq);
  }

  /** Nothing was sent (refused before the broadcast): the key and payment are free again. */
  abandon(p: Pending): void {
    this.inFlight.delete(p.seq);
    this.tryAppend({ op: "abandon", seq: p.seq, at: new Date().toISOString() });
    if (p.key !== undefined && this.byKey.get(p.key)?.state === "in-flight") this.byKey.delete(p.key);
  }
}

export type { Pending as SendGuardPending };

const guards = new Map<string, SendGuard>();

/** The guard of one workspace, loaded from its log on first use in this process. */
/**
 * LOCK-RACE-1: one guard per PHYSICAL workspace — two paths to it (a junction, a symlink, another spelling) resolve to
 * the same real path, so they share one guard instead of two in-memory states over one log.
 */
function canonicalRoot(root: string): string {
  const resolved = path.resolve(root);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved; // not created yet: the lock (one physical file) still decides ownership
  }
}

export function sendGuardFor(root: string): SendGuard {
  const resolved = canonicalRoot(root);
  let g = guards.get(resolved);
  if (!g) {
    g = new SendGuard(resolved);
    guards.set(resolved, g);
  }
  return g;
}

/** Locks this process created, by file → nonce. Released (only if they still name this process) on exit or a signal. */
const heldLocks = new Map<string, string>();
let releaseRegistered = false;

function readLockFile(file: string): { pid?: unknown; nonce?: unknown } | undefined {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8"));
    return v && typeof v === "object" ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Remove a lock THIS process created, and only while it still names this process and nonce. (Between this check and the
 * unlink nobody else can have created the file: it exists, so every other `wx` create fails, and no other process ever
 * removes a lock it did not create.)
 */
function releaseHeld(file: string, nonce: string, unlink = true): void {
  if (heldLocks.get(file) !== nonce) return;
  heldLocks.delete(file);
  if (!unlink) return;
  const held = readLockFile(file);
  if (held?.pid === process.pid && held?.nonce === nonce) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* already gone */
    }
  }
}

function releaseAllHeld(): void {
  for (const [file, nonce] of [...heldLocks]) releaseHeld(file, nonce);
}

function holdLock(file: string, nonce: string): void {
  heldLocks.set(file, nonce);
  if (releaseRegistered) return;
  releaseRegistered = true;
  process.once("exit", releaseAllHeld);
  // Ctrl+C / termination end the process without "exit": release first, then let the signal do what it would have done
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    if (process.listenerCount(sig) > 0) continue; // the application handles it (and exits through "exit")
    const onSignal = () => {
      releaseAllHeld();
      process.removeListener(sig, onSignal);
      if (process.listenerCount(sig) === 0) process.kill(process.pid, sig);
    };
    process.on(sig, onSignal);
  }
}

/**
 * LOCK-RACE-1 · controlled recovery of a STALE lock, by an operator who has stopped every dev server on the workspace.
 * Archives (renames) the lock to `send-guard.v1.lock.stale-<pid>-<time>` — evidence is never deleted — only when it
 * names `pid` and that process is not running. The log is untouched: unknown outcomes the dead owner left stay blocking.
 */
export function recoverStaleSendGuardLock(root: string, opts: { pid: number }): { archived: string } {
  const lockFile = path.join(canonicalRoot(root), SEND_GUARD_LOCK);
  const held = readLockFile(lockFile);
  if (held === undefined) throw new Error(`recoverStaleSendGuardLock: ${lockFile} cannot be read; nothing was changed.`);
  if (held.pid !== opts.pid) {
    throw new Error(`recoverStaleSendGuardLock: ${lockFile} names pid ${String(held.pid)}, not ${opts.pid}; nothing was changed.`);
  }
  if (isRunning(opts.pid)) {
    throw new Error(`recoverStaleSendGuardLock: pid ${opts.pid} is alive (running): it owns the guard; nothing was changed.`);
  }
  const archived = `${lockFile}.stale-${opts.pid}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.renameSync(lockFile, archived);
  return { archived };
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    // EPERM: it exists (another user's process); anything but ESRCH is treated as running (fail closed)
    return e?.code !== "ESRCH";
  }
}

/** Test hook: forget the in-memory guards, as a clean process restart does (logs on disk stay; own locks released). */
export function __resetSendGuardForTests(): void {
  // a CLEAN restart: this process's locks are released (as on exit), its memory forgotten; logs stay on disk
  releaseAllHeld();
  guards.clear();
}
