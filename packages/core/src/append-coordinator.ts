import fs from "node:fs";
import path from "node:path";
import { getTelemetry } from "./telemetry.js";

export class AppendCoordinator {
  private static _lastRecovery: any = null;
  /**
   * Safely appends a line to a JSONL log under process coordination locks.
   * Performs an immediate fsync to ensure data durability.
   * Also repairs the trailing line if it is corrupted, emitting an anomaly.
   */
  public static appendAtomic(filePath: string, line: string, rootDir: string): void {
    const lockDir = path.join(rootDir, ".hardkas", "locks");
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }

    const logBase = path.basename(filePath);
    const lockPath = path.join(lockDir, `append-${logBase}.lock`);
    let fd: number | null = null;
    let repaired = false;
    let linesDiscarded = 0;
    let originalTail = "";

    try {
      // 1. Acquire exclusive append lock physically using openSync wx
      // To support flock-like process blocking safely across Unix and Windows,
      // we spin-wait for exclusive file open or flock.
      // Since fs.openSync with "wx" is atomic, we can spin-wait on it.
      // Even better, on Node, we can use fs.openSync with 'a' and flockSync if available,
      // but to be 100% portable and cross-process safe, we spin-wait on a '.lock' file creation.
      const start = Date.now();
      const timeoutMs = 10000;

      while (true) {
        try {
          fd = fs.openSync(lockPath, "wx");
          break;
        } catch (e: unknown) {
          if ((e as NodeJS.ErrnoException).code === "EEXIST") {
            if (Date.now() - start > timeoutMs) {
              throw new Error(
                `[AppendCoordinator] Timeout waiting for lock on ${lockPath}`
              );
            }
            // Spin-wait sleep
            const sleepMs = 5 + Math.floor(Math.random() * 15);
            // Synchronous block sleep using atomic wait or buffer
            const sharedBuf = new Int32Array(new SharedArrayBuffer(4));
            Atomics.wait(sharedBuf, 0, 0, sleepMs);
            continue;
          }
          throw e;
        }
      }

      // Write owner details to lock file
      fs.writeSync(
        fd,
        JSON.stringify({ pid: process.pid, time: new Date().toISOString() })
      );

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

    // 6. Log anomaly if recovery happened (outside of the append lock to avoid deadlocks/recursion)
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
