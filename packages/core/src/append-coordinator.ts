import fs from "node:fs";
import path from "node:path";
import { getTelemetry } from "./telemetry.js";

export class AppendCoordinator {
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
        } catch (e: any) {
          if (e.code === "EEXIST") {
            if (Date.now() - start > timeoutMs) {
              throw new Error(`[AppendCoordinator] Timeout waiting for lock on ${lockPath}`);
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
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, time: new Date().toISOString() }));

      // 2. Repair tail if needed
      const recovery = AppendCoordinator.recoverCorruptedTail(filePath);
      if (recovery.repaired) {
        repaired = true;
        linesDiscarded = recovery.linesDiscarded;
        originalTail = recovery.originalTail;
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
        try { fs.unlinkSync(lockPath); } catch {}
      }
    }

    // 6. Log anomaly if recovery happened (outside of the append lock to avoid deadlocks/recursion)
    if (repaired) {
      try {
        const telemetry = getTelemetry();
        telemetry.logAnomaly(
          "EXTERNAL_MUTATION",
          "medium",
          "fs",
          `Recovered corrupted trailing line in ${logBase}. Discarded ${linesDiscarded} malformed bytes. Original tail snippet: "${originalTail.slice(0, 60)}..."`,
          rootDir
        );
      } catch {
        // Safe fallback if telemetry is not yet fully initialized or in recursive loop
      }
    }
  }

  /**
   * Scans a JSONL stream for corruption, truncating malformed trailing lines.
   */
  public static recoverCorruptedTail(filePath: string): { repaired: boolean; linesDiscarded: number; originalTail: string } {
    if (!fs.existsSync(filePath)) return { repaired: false, linesDiscarded: 0, originalTail: "" };

    const stat = fs.statSync(filePath);
    if (stat.size === 0) return { repaired: false, linesDiscarded: 0, originalTail: "" };

    // Only read the tail of the file (last 4KB is more than enough for any single JSONL line)
    const TAIL_SIZE = 4096;
    const readStart = Math.max(0, stat.size - TAIL_SIZE);
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(Math.min(TAIL_SIZE, stat.size));
    fs.readSync(fd, buf, 0, buf.length, readStart);
    fs.closeSync(fd);

    const tail = buf.toString("utf-8");
    const lines = tail.split("\n");
    if (lines.length === 0) return { repaired: false, linesDiscarded: 0, originalTail: "" };

    // Get the last non-empty line
    let lastLine = "";
    let lastLineIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i]!.trim();
      if (l) {
        lastLine = l;
        lastLineIdx = i;
        break;
      }
    }

    if (!lastLine) return { repaired: false, linesDiscarded: 0, originalTail: "" };

    // If we started reading mid-file, the first "line" may be a partial fragment.
    // Only trust it if we read from the beginning of the file or if lastLineIdx > 0
    // (meaning there was a newline before it, so it's a complete line).
    if (readStart > 0 && lastLineIdx === 0) {
      // The only non-empty content is in the first (potentially partial) line of the chunk.
      // We can't trust it — but we also can't know if it's corrupt or just large.
      // Conservatively assume it's fine; a truly corrupt tail will be caught on the next
      // append when more data pushes it to a later line position.
      return { repaired: false, linesDiscarded: 0, originalTail: "" };
    }

    try {
      JSON.parse(lastLine);
      return { repaired: false, linesDiscarded: 0, originalTail: "" };
    } catch (err: any) {
      // Corruption detected at the tail! Truncate the file.
      // Calculate the byte position to truncate to: everything before the corrupted last line.
      const linesAfterCorrupt = lines.slice(lastLineIdx).join("\n");
      const bytesToRemove = Buffer.byteLength(linesAfterCorrupt, "utf-8");
      const truncateTo = stat.size - bytesToRemove;

      fs.truncateSync(filePath, truncateTo > 0 ? truncateTo : 0);
      return { 
        repaired: true, 
        linesDiscarded: stat.size - truncateTo, 
        originalTail: lastLine 
      };
    }
  }
}
