import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HardkasSchemas } from "./registry.js";
import { HardkasError } from "./errors.js";
import { getTelemetry } from "./telemetry.js";

/** How long an append waits for the lock of a holder that may be alive before it fails (EVENT-LEDGER-2 kept it). */
export const APPEND_LOCK_WAIT_MS = 10_000;
/** An empty or unreadable lock younger than this is a holder between creating the file and writing its record. */
export const APPEND_LOCK_CREATION_GRACE_MS = 2_000;
/**
 * A record without a hostname (`{pid, time}`, written by earlier HardKAS releases) cannot be placed on a host. It is
 * recovered only when its pid is not running on THIS host and the file is at least this old: an append takes
 * milliseconds, so a record this old whose process is gone here was not left by a live holder elsewhere.
 */
export const LEGACY_APPEND_LOCK_MIN_AGE_MS = 60_000;

/**
 * The owner record of an append lock (`.hardkas/locks/append-<file>.lock`): the shape of every workspace lock
 * (`hardkas.lock.v1`), so `listLocks`, `lock doctor` and `lock clear --if-dead` read it like any other lock
 * (EVENT-LEDGER-2 D7). The hostname is what makes the liveness of its pid decidable.
 */
export interface AppendLockRecord {
  schema: typeof HardkasSchemas.LockV1;
  name: string;
  pid: number;
  command: string;
  cwd: string;
  hostname: string;
  createdAt: string;
  expiresAt: null;
}

/** What a lock file says about its holder, as far as it can be read. */
export interface AppendLockHolder {
  pid?: number;
  hostname?: string;
  command?: string;
  createdAt?: string;
}

/**
 * EVENT-LEDGER-2 (D1) · the verdict on an existing append lock, decided before anything is touched:
 *  - `live`: a holder that may be running; it is waited for and NEVER taken over;
 *  - `unverifiable`: held on another host; its liveness cannot be checked here, so it is waited for like a live one;
 *  - `abandoned`: its holder is gone (a dead pid on this host, or an empty / unreadable file past the creation grace);
 *    `bytes` is exactly what was judged, and only that exact content is ever removed;
 *  - `gone`: the file disappeared meanwhile.
 */
export type AppendLockVerdict =
  | { state: "gone" }
  | { state: "live"; reason: string; holder: AppendLockHolder | undefined }
  | { state: "unverifiable"; reason: string; holder: AppendLockHolder | undefined }
  | { state: "abandoned"; reason: string; holder: AppendLockHolder | undefined; bytes: Buffer; ageMs: number };

/** The same rule as `lockCommandOf` (lock.ts): executable, script and at most two command words, never arguments. */
function commandOfArgv(argv: readonly string[]): string {
  const words: string[] = [];
  for (const token of argv.slice(2)) {
    if (words.length === 2 || !/^[a-z][a-z0-9-]*$/.test(token)) break;
    words.push(token);
  }
  return [...argv.slice(0, 2), ...words].join(" ");
}

/** Same rule as `isProcessAlive` (lock.ts): only ESRCH means dead; EPERM and anything ambiguous mean alive. */
function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    return (e as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** The record this process writes into an append lock it just created. */
export function appendLockRecord(lockName: string, now: Date = new Date()): AppendLockRecord {
  return {
    schema: HardkasSchemas.LockV1,
    name: lockName,
    pid: process.pid,
    command: commandOfArgv(process.argv),
    cwd: process.cwd(),
    hostname: os.hostname(),
    createdAt: now.toISOString(),
    expiresAt: null
  };
}

/** Judges an existing append lock without touching it (see AppendLockVerdict). */
export function judgeAppendLock(lockPath: string, now: number = Date.now()): AppendLockVerdict {
  let bytes: Buffer;
  let stat: fs.Stats;
  try {
    bytes = fs.readFileSync(lockPath);
    stat = fs.statSync(lockPath);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { state: "gone" };
    return { state: "live", reason: `the lock file cannot be read right now (${code ?? String(e)})`, holder: undefined };
  }
  const ageMs = Math.max(0, now - stat.mtimeMs);
  const abandoned = (reason: string, holder: AppendLockHolder | undefined): AppendLockVerdict => ({ state: "abandoned", reason, holder, bytes, ageMs });
  const live = (reason: string, holder: AppendLockHolder | undefined): AppendLockVerdict => ({ state: "live", reason, holder });

  let record: any;
  try {
    record = JSON.parse(bytes.toString("utf8"));
  } catch {
    record = undefined;
  }
  if (!record || typeof record !== "object") {
    const what = bytes.length === 0 ? "an empty lock file" : "an unreadable lock file";
    return ageMs >= APPEND_LOCK_CREATION_GRACE_MS
      ? abandoned(`${what} ${ageMs} ms old, past the creation grace of ${APPEND_LOCK_CREATION_GRACE_MS} ms`, undefined)
      : live(`${what} ${ageMs} ms old: a holder may still be writing its record`, undefined);
  }

  const holder: AppendLockHolder = {
    ...(Number.isInteger(record.pid) ? { pid: record.pid as number } : {}),
    ...(typeof record.hostname === "string" ? { hostname: record.hostname as string } : {}),
    ...(typeof record.command === "string" ? { command: record.command as string } : {}),
    ...(typeof (record.createdAt ?? record.time) === "string" ? { createdAt: (record.createdAt ?? record.time) as string } : {})
  };
  const pid = Number(record.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return ageMs >= APPEND_LOCK_CREATION_GRACE_MS
      ? abandoned(`a lock record without a pid, ${ageMs} ms old`, holder)
      : live(`a lock record without a pid, ${ageMs} ms old: a holder may still be writing it`, holder);
  }
  if (holder.hostname !== undefined && holder.hostname !== os.hostname()) {
    return {
      state: "unverifiable",
      reason: `held by process ${pid} on another host (${holder.hostname}); its liveness cannot be checked from ${os.hostname()}`,
      holder
    };
  }
  if (pid === process.pid) {
    // EVENT-LEDGER-2 closeout (CL-3): a record naming this process is held by a live process — this one, through
    // another of its flows (a worker thread shares the pid). Whether it is instead the leftover of an earlier process
    // that had this pid cannot be decided from the record, so it is waited for like any live holder, never taken over;
    // the next process (another pid) recovers such a leftover.
    return live(`held by this process (pid ${pid}), through another of its flows`, holder);
  }
  if (processIsAlive(pid)) return live(`held by process ${pid}, which is running on this host`, holder);
  if (holder.hostname === undefined && ageMs < LEGACY_APPEND_LOCK_MIN_AGE_MS) {
    return live(`a record without hostname (an earlier HardKAS) ${ageMs} ms old: too young to recover without knowing its host`, holder);
  }
  return abandoned(
    holder.hostname === undefined
      ? `a record without hostname whose process ${pid} is not running on this host, ${ageMs} ms old`
      : `its process ${pid} is not running on this host`,
    holder
  );
}

/** Removes `file` only if it still holds exactly `bytes` (what this call wrote); anything else is left alone. */
function removeIfUnchanged(file: string, bytes: Buffer): void {
  try {
    if (fs.readFileSync(file).equals(bytes)) fs.unlinkSync(file);
  } catch {
    // gone already, or unreadable right now: left alone
  }
}

function sleepMs(ms: number): void {
  const sharedBuf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sharedBuf, 0, 0, ms);
}

/** What one attempt to recover an abandoned append lock came to (recoverAbandonedLock). */
type RecoveryAttempt =
  | { kind: "recovered" }
  | { kind: "retry" }
  | { kind: "waiting"; reason: string }
  | { kind: "blocked"; recovery: Extract<AppendLockVerdict, { state: "abandoned" }> };

export class AppendCoordinator {
  private static _lastRecovery: any = null;

  /**
   * EVENT-LEDGER-2 (D1, closeout CL-4) · removes an abandoned append lock, safely:
   *  1. one recovery lock (`<lock name>.recover.lock` next to the append lock, taken with `wx` and carrying its
   *     recoverer's record) serializes the recoverers. An existing recovery lock is judged like a lock
   *     (judgeAppendLock) and is NEVER removed automatically: while its recoverer may be alive — this host's live pid,
   *     this very process, another host — the recovery waits for it ("waiting"), however long it lasts; when its
   *     recoverer is gone (a recovery that stopped halfway), removing it — read, compare, unlink — could race with
   *     another recoverer, so the recovery fails closed ("blocked") and an administrator clears it with the lock tools;
   *  2. under the recovery lock the append lock is read again and removed ONLY if it is byte for byte the content that
   *     was judged abandoned (a lock that changed meanwhile is a new holder's and is never touched). Nobody else removes
   *     the abandoned lock while a recoverer holds the recovery lock, so no new holder can appear between its check and
   *     its unlink.
   * The recovery lock this call took is released by this call, and only if it still holds what this call wrote.
   */
  private static recoverAbandonedLock(
    lockPath: string,
    recoveryPath: string,
    recoveryName: string,
    verdict: Extract<AppendLockVerdict, { state: "abandoned" }>
  ): RecoveryAttempt {
    let recoveryFd: number;
    try {
      recoveryFd = fs.openSync(recoveryPath, "wx");
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const recovery = judgeAppendLock(recoveryPath);
      if (recovery.state === "gone") return { kind: "retry" };
      if (recovery.state === "abandoned") return { kind: "blocked", recovery };
      // a recovery that may still be running is waited for, never taken over
      return { kind: "waiting", reason: `a recovery of it is in progress (${recovery.reason})` };
    }
    const mine = Buffer.from(JSON.stringify(appendLockRecord(recoveryName)), "utf8");
    let written = 0;
    try {
      written = fs.writeSync(recoveryFd, mine);
      let current: Buffer;
      try {
        current = fs.readFileSync(lockPath);
      } catch {
        return { kind: "retry" }; // already recovered by someone else
      }
      if (!current.equals(verdict.bytes)) return { kind: "retry" }; // a different lock now: a new holder's, never touched
      try {
        fs.unlinkSync(lockPath);
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return { kind: "retry" };
        throw e;
      }
      return { kind: "recovered" };
    } finally {
      fs.closeSync(recoveryFd);
      // release the recovery lock this call took: nobody else removes it automatically, so it still holds what this
      // call wrote (nothing, if that write failed) unless an administrator cleared it meanwhile
      removeIfUnchanged(recoveryPath, mine.subarray(0, written));
    }
  }

  /**
   * Safely appends a line to a JSONL log under process coordination locks.
   * Performs an immediate fsync to ensure data durability.
   * Also repairs the trailing line if it is corrupted, emitting an anomaly.
   *
   * The lock (`.hardkas/locks/append-<file>.lock`) is taken with `wx` and carries this process's record
   * (AppendLockRecord). An existing lock is judged first (judgeAppendLock): a live or unverifiable holder is waited
   * for up to APPEND_LOCK_WAIT_MS and never taken over (then APPEND_LOCK_TIMEOUT, naming it); an abandoned one is
   * recovered (recoverAbandonedLock) and the append proceeds without waiting — unless an earlier recovery of it stopped
   * halfway and left its recovery lock, which is never removed automatically: the append then fails at once with
   * APPEND_LOCK_RECOVERY_BLOCKED, naming the lock-tool command that clears it. A recovery is recorded as a
   * STALE_LOCK_RECOVERY anomaly in the workspace telemetry, after the lock is released.
   */
  public static appendAtomic(filePath: string, line: string, rootDir: string): void {
    const lockDir = path.join(rootDir, ".hardkas", "locks");
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }

    const logBase = path.basename(filePath);
    const lockName = `append-${logBase}`;
    const lockPath = path.join(lockDir, `${lockName}.lock`);
    // closeout CL-4: the recovery lock is one more workspace lock, so `lock list` / `lock doctor` show it and
    // `lock clear <name> --if-dead` removes it once its recoverer is gone
    const recoveryName = `${lockName}.recover`;
    const recoveryPath = path.join(lockDir, `${recoveryName}.lock`);
    let fd: number | null = null;
    let repaired = false;
    let linesDiscarded = 0;
    let originalTail = "";
    let recovered: { reason: string; holder: AppendLockHolder | undefined } | undefined;

    try {
      // 1. Acquire the exclusive append lock: fs.openSync "wx" is atomic, so the acquisition spins on it.
      const start = Date.now();

      while (true) {
        try {
          fd = fs.openSync(lockPath, "wx");
          break;
        } catch (e: unknown) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          const verdict = judgeAppendLock(lockPath);
          let recoveryInProgress: string | undefined;
          if (verdict.state === "abandoned") {
            const attempt = AppendCoordinator.recoverAbandonedLock(lockPath, recoveryPath, recoveryName, verdict);
            if (attempt.kind === "recovered") {
              recovered = { reason: verdict.reason, holder: verdict.holder };
              continue; // the next wx takes the lock, or waits for whoever took it first
            }
            if (attempt.kind === "blocked") {
              // closeout CL-4 (fail closed): the abandoned recovery lock is the administrator's to clear
              const named = attempt.recovery.holder?.pid !== undefined;
              const clear = named
                ? `'hardkas lock clear ${recoveryName} --if-dead' (it removes the recovery lock only if its process is gone)`
                : `'hardkas lock clear ${recoveryName} --force' (an empty or unreadable recovery lock names no process to check)`;
              throw new HardkasError(
                "APPEND_LOCK_RECOVERY_BLOCKED",
                `The append lock of ${logBase} (${lockPath}) was left by a holder that is gone (${verdict.reason}), but it is not ` +
                  `recovered automatically: an earlier recovery of it stopped halfway and left its recovery lock ${recoveryPath} ` +
                  `(${attempt.recovery.reason}). HardKAS never removes a recovery lock by itself, because removing it could race ` +
                  `with another recoverer. Check that no HardKAS command is running in this workspace, then run ${clear}; the ` +
                  `next command recovers the append lock.`,
                {
                  metadata: {
                    lockPath,
                    lockName,
                    recoveryLockPath: recoveryPath,
                    recoveryLockName: recoveryName,
                    holder: verdict.holder,
                    recoveryHolder: attempt.recovery.holder,
                    state: "recovery-blocked"
                  }
                }
              );
            }
            if (attempt.kind === "waiting") recoveryInProgress = attempt.reason;
          }
          const waitedMs = Date.now() - start;
          if (waitedMs > APPEND_LOCK_WAIT_MS) {
            const reason =
              verdict.state === "gone"
                ? "the lock keeps reappearing"
                : recoveryInProgress
                  ? `${verdict.reason}, and ${recoveryInProgress}`
                  : verdict.reason;
            throw new HardkasError(
              "APPEND_LOCK_TIMEOUT",
              `Could not take the append lock of ${logBase} (${lockPath}) within ${APPEND_LOCK_WAIT_MS} ms: ${reason}. ` +
                `A lock whose holder may be alive is never taken over. If that holder is gone, 'hardkas lock doctor' reports it ` +
                `and 'hardkas lock clear ${lockName} --if-dead' removes it.`,
              { metadata: { lockPath, lockName, state: verdict.state, holder: verdict.state === "gone" ? undefined : verdict.holder, waitedMs } }
            );
          }
          if (verdict.state !== "gone") sleepMs(5 + Math.floor(Math.random() * 15));
        }
      }

      // Write owner details to lock file (the shape every workspace lock has, so the lock tools can read it)
      fs.writeSync(fd, JSON.stringify(appendLockRecord(lockName)));

      // 2. Repair tail if needed
      const recovery = AppendCoordinator.recoverCorruptedTail(filePath);
      if (recovery.repaired) {
        repaired = true;
        linesDiscarded = recovery.linesDiscarded;
        originalTail = recovery.originalTail;
        AppendCoordinator._lastRecovery = recovery; // Store recovery metrics on class for logging reference
      }

      // 3. Open target log file in append mode
      const logDir = path.dirname(filePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const logFd = fs.openSync(filePath, "a");
      const buffer = Buffer.from(line.endsWith("\n") ? line : line + "\n", "utf-8");

      // 4. Append and fsync to physical disk
      fs.writeSync(logFd, buffer, 0, buffer.length);
      fs.fsyncSync(logFd);
      fs.closeSync(logFd);
    } finally {
      // 5. Release lock
      if (fd !== null) {
        fs.closeSync(fd);
        try {
          fs.unlinkSync(lockPath);
        } catch {}
      }
    }

    // 6. Anomalies are logged outside of the append lock (telemetry appends through this same coordinator)
    if (recovered) {
      try {
        const who = recovered.holder?.pid !== undefined ? ` (pid ${recovered.holder.pid}${recovered.holder.command ? `, ${recovered.holder.command}` : ""})` : "";
        getTelemetry().logAnomaly(
          "STALE_LOCK_RECOVERY",
          "medium",
          "lock",
          `Recovered the abandoned append lock ${lockPath} before appending to ${logBase}: ${recovered.reason}${who}`,
          rootDir
        );
      } catch {
        // telemetry is best effort
      }
    }
    if (repaired) {
      try {
        const recovery = AppendCoordinator._lastRecovery;
        const telemetry = getTelemetry();
        telemetry.logAnomaly(
          "EXTERNAL_MUTATION",
          "medium",
          "fs",
          `Recovered corrupted tail in ${logBase}. Original size: ${recovery.originalSize} bytes, Recovered size: ${recovery.recoveredSize} bytes, Truncated bytes: ${linesDiscarded}. Reason: ${recovery.reason}. Original tail snippet: "${originalTail.slice(0, 60)}..."`,
          rootDir
        );
      } catch {
        // Safe fallback if telemetry is not yet fully initialized or in recursive loop
      }
    }
  }

  /**
   * Scans a JSONL stream for corruption, truncating malformed trailing lines.
   * Utilizes a backward newline scanning logic with a rolling buffer,
   * supporting lines of arbitrary size and only truncating the last complete
   * valid JSONL boundary if a parse failure is detected.
   */
  public static recoverCorruptedTail(filePath: string): {
    repaired: boolean;
    linesDiscarded: number;
    originalTail: string;
    originalSize: number;
    recoveredSize: number;
    reason: string;
  } {
    const defaultRes = {
      repaired: false,
      linesDiscarded: 0,
      originalTail: "",
      originalSize: 0,
      recoveredSize: 0,
      reason: ""
    };

    if (!fs.existsSync(filePath)) return defaultRes;

    const stat = fs.statSync(filePath);
    defaultRes.originalSize = stat.size;
    defaultRes.recoveredSize = stat.size;
    if (stat.size === 0) return defaultRes;

    const fd = fs.openSync(filePath, "r");

    try {
      let lastCharPos = -1;
      let precedingNewlinePos = -1;

      const CHUNK_SIZE = 64 * 1024; // 64KB chunks
      let position = stat.size;
      const buffer = Buffer.alloc(CHUNK_SIZE);

      // Pass 1: Find the last non-whitespace/non-newline character from the end
      outer1: while (position > 0) {
        const readLength = Math.min(CHUNK_SIZE, position);
        position -= readLength;

        fs.readSync(fd, buffer, 0, readLength, position);

        for (let i = readLength - 1; i >= 0; i--) {
          const charCode = buffer[i];
          // Skip space, tab, \n, \r
          if (
            charCode !== 0x20 &&
            charCode !== 0x09 &&
            charCode !== 0x0a &&
            charCode !== 0x0d
          ) {
            lastCharPos = position + i;
            break outer1;
          }
        }
      }

      // If the file only contains whitespace/newlines
      if (lastCharPos === -1) {
        fs.closeSync(fd);
        fs.truncateSync(filePath, 0);
        return {
          repaired: true,
          linesDiscarded: stat.size,
          originalTail: "",
          originalSize: stat.size,
          recoveredSize: 0,
          reason: "File only contained whitespaces or newlines"
        };
      }

      // Pass 2: Find the newline preceding lastCharPos
      position = lastCharPos;
      outer2: while (position > 0) {
        const readLength = Math.min(CHUNK_SIZE, position);
        position -= readLength;

        fs.readSync(fd, buffer, 0, readLength, position);

        for (let i = readLength - 1; i >= 0; i--) {
          if (buffer[i] === 0x0a) {
            // \n
            precedingNewlinePos = position + i;
            break outer2;
          }
        }
      }

      const lastLineStart = precedingNewlinePos === -1 ? 0 : precedingNewlinePos + 1;
      const lastLineEnd = lastCharPos + 1;

      // Read the last line
      const lastLineLength = lastLineEnd - lastLineStart;
      const lastLineBuf = Buffer.alloc(lastLineLength);
      fs.readSync(fd, lastLineBuf, 0, lastLineLength, lastLineStart);
      fs.closeSync(fd);

      const lastLine = lastLineBuf.toString("utf-8");

      try {
        JSON.parse(lastLine);
        // Valid JSON! No corruption.
        return defaultRes;
      } catch (err: unknown) {
        // Invalid JSON! Truncate the file to lastLineStart
        const truncateTo = lastLineStart;
        const discardedBytes = stat.size - truncateTo;
        let truncated = false;
        let retries = 5;
        let lastError = null;
        while (retries > 0 && !truncated) {
          try {
            fs.truncateSync(filePath, truncateTo);
            truncated = true;
          } catch (e: unknown) {
            lastError = e;
            retries--;
            if (retries > 0) {
              const sharedBuf = new Int32Array(new SharedArrayBuffer(4));
              Atomics.wait(sharedBuf, 0, 0, 10); // Wait 10ms
            }
          }
        }
        if (!truncated) throw lastError;

        return {
          repaired: true,
          linesDiscarded: discardedBytes,
          originalTail: lastLine,
          originalSize: stat.size,
          recoveredSize: truncateTo,
          reason: err instanceof Error ? ((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err)) : "Invalid JSON syntax"
        };
      }
    } catch (e) {
      try {
        fs.closeSync(fd);
      } catch {}
      throw e;
    }
  }
}
