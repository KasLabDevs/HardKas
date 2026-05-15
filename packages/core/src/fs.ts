import fs from "node:fs";
import path from "node:path";
import { HardkasError } from "./index.js";

/**
 * Options for atomic file writing.
 */
export interface WriteFileAtomicOptions {
  /** Encoding for string data (default: utf-8) */
  encoding?: BufferEncoding;
  /** File mode (permissions) */
  mode?: number;
  /** If true, calls fsync on the parent directory (Linux/macOS) */
  fsyncParent?: boolean;
}

/**
 * Writes a file atomically using the temp-file-and-rename pattern.
 * Ensures that either the entire file is written or no changes are made.
 * 
 * Pattern:
 * 1. Write data to a temporary file in the same directory.
 * 2. fsync the temporary file to ensure data is on disk.
 * 3. Close the temporary file.
 * 4. Rename the temporary file to the target path (atomic operation).
 * 5. Optional: fsync the parent directory to ensure metadata is on disk.
 */
export async function writeFileAtomic(
  targetPath: string,
  data: string | Buffer,
  options: WriteFileAtomicOptions = {}
): Promise<void> {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tempPath = path.join(dir, `.tmp.${base}.${Math.random().toString(36).slice(2)}`);

  let fd: number | null = null;
  
  try {
    // 1. Write to temp file
    // Ensure dir exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open temp file with exclusive write
    fd = fs.openSync(tempPath, "w", options.mode);
    
    const buffer = typeof data === "string" ? Buffer.from(data, options.encoding || "utf-8") : data;
    fs.writeSync(fd, buffer, 0, buffer.length);

    // 2. fsync temp file
    fs.fsyncSync(fd);

    // 3. Close temp file
    fs.closeSync(fd);
    fd = null;

    // 4. Atomic Rename
    // On Windows, rename can fail if the file is being read or antivirus is scanning it.
    // We attempt a few retries on Windows for EPERM/EBUSY.
    let attempts = 0;
    const maxAttempts = process.platform === "win32" ? 5 : 1;
    
    while (attempts < maxAttempts) {
      try {
        fs.renameSync(tempPath, targetPath);
        break;
      } catch (e: any) {
        attempts++;
        if (attempts >= maxAttempts) throw e;
        if (e.code === "EPERM" || e.code === "EBUSY") {
          // Wait 10ms-50ms before retrying on Windows
          await new Promise(resolve => setTimeout(resolve, 10 * attempts));
          continue;
        }
        throw e;
      }
    }

    // 5. fsync parent directory (important on some filesystems for directory entry durability)
    if (options.fsyncParent && process.platform !== "win32") {
      let dirFd: number | null = null;
      try {
        dirFd = fs.openSync(dir, "r");
        fs.fsyncSync(dirFd);
      } catch (e) {
        // Parent fsync is a best-effort hardening; ignore if directory cannot be opened
      } finally {
        if (dirFd !== null) fs.closeSync(dirFd);
      }
    }
  } catch (err: any) {
    throw new HardkasError(
      "IO_ERROR",
      `Failed to write file atomically: ${targetPath}`,
      { cause: err }
    );
  } finally {
    // Cleanup temp file in ALL cases (success or failure)
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) { /* ignore cleanup error */ }
    }
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (e) { /* ignore */ }
    }
  }
}

/**
 * Synchronous version of writeFileAtomic.
 */
export function writeFileAtomicSync(
  targetPath: string,
  data: string | Buffer,
  options: WriteFileAtomicOptions = {}
): void {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tempPath = path.join(dir, `.tmp.${base}.${Math.random().toString(36).slice(2)}`);

  let fd: number | null = null;
  
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fd = fs.openSync(tempPath, "w", options.mode);
    const buffer = typeof data === "string" ? Buffer.from(data, options.encoding || "utf-8") : data;
    fs.writeSync(fd, buffer, 0, buffer.length);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    // 4. Atomic Rename
    let attempts = 0;
    const maxAttempts = process.platform === "win32" ? 5 : 1;
    while (attempts < maxAttempts) {
      try {
        fs.renameSync(tempPath, targetPath);
        break;
      } catch (e: any) {
        attempts++;
        if (attempts >= maxAttempts) throw e;
        if (e.code === "EPERM" || e.code === "EBUSY") {
          // Sync sleep (spin-wait) on Windows is nasty but sometimes needed in sync paths
          // For now, just retry immediately or throw if it's too much.
          continue;
        }
        throw e;
      }
    }

    if (options.fsyncParent && process.platform !== "win32") {
      let dirFd: number | null = null;
      try {
        dirFd = fs.openSync(dir, "r");
        fs.fsyncSync(dirFd);
      } catch (e) {
        // ignore
      } finally {
        if (dirFd !== null) fs.closeSync(dirFd);
      }
    }
  } catch (err: any) {
    throw new HardkasError(
      "IO_ERROR",
      `Failed to write file atomically (sync): ${targetPath}`,
      { cause: err }
    );
  } finally {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
    }
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (e) { /* ignore */ }
    }
  }
}
