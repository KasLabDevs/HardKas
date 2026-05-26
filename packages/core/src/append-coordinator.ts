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

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
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

    try {
      JSON.parse(lastLine);
      return { repaired: false, linesDiscarded: 0, originalTail: "" };
    } catch (err: any) {
      // Corruption detected at the tail! Truncate the file.
      // Find the index of the start of this line in the original file content
      // We join all lines up to lastLineIdx to find the exact byte index
      const keptContent = lines.slice(0, lastLineIdx).join("\n") + (lastLineIdx > 0 ? "\n" : "");
      const keptBytes = Buffer.byteLength(keptContent, "utf-8");
      
      fs.truncateSync(filePath, keptBytes);
      return { 
        repaired: true, 
        linesDiscarded: stat.size - keptBytes, 
        originalTail: lastLine 
      };
    }
  }
}
