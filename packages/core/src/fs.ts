import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { HardkasError } from "./index.js";
import { EnvironmentTelemetry } from "./telemetry.js";

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
  const tempPath = path.join(dir, `.tmp.${base}.${crypto.randomUUID()}`);

  let fd: number | null = null;

  try {
    // 1. Write to temp file
    // Ensure dir exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open temp file with exclusive write
    fd = fs.openSync(tempPath, "w", options.mode);

    const buffer =
      typeof data === "string" ? Buffer.from(data, options.encoding || "utf-8") : data;
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
      } catch (e: unknown) {
        attempts++;
        if (attempts >= maxAttempts) throw e;
        if ((e as any).code === "EPERM" || (e as any).code === "EBUSY") {
          EnvironmentTelemetry.logAnomaly(
            "FS_RETRY",
            "low",
            "fs",
            `Retrying rename of ${targetPath} due to ${(e as any).code}`
          );
          // Wait 10ms-50ms before retrying on Windows
          await new Promise((resolve) => setTimeout(resolve, 10 * attempts));
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
  } catch (err: unknown) {
    throw new HardkasError("IO_ERROR", `Failed to write file atomically: ${targetPath}`, {
      cause: err
    });
  } finally {
    // Cleanup temp file in ALL cases (success or failure)
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        /* ignore cleanup error */
      }
    }
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (e) {
        /* ignore */
      }
    }
  }
}

/** The text without one leading UTF-8 BOM (U+FEFF), which editors such as Notepad and PowerShell 5 write: it is not content. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Reads a JSON file a user may have written by hand: a leading BOM is ignored; read and parse errors are kept as they are. */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  return JSON.parse(stripBom(await fs.promises.readFile(filePath, "utf-8"))) as T;
}

/** Synchronous version of readJsonFile. */
export function readJsonFileSync<T = unknown>(filePath: string): T {
  return JSON.parse(stripBom(fs.readFileSync(filePath, "utf-8"))) as T;
}

// CONTAINMENT-2 (D1): the names Windows maps to a device, with or without an extension and in any case.
const WINDOWS_DEVICE_STEM = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)$/i;

/**
 * A name Windows does not treat as a plain file: a device name (CON, PRN, AUX, NUL, COM0-9, LPT0-9, COM¹²³, LPT¹²³,
 * CONIN$, CONOUT$), with or without an extension and in any case, or a name ending in a dot or a space (Win32 strips
 * them, so the name aliases another file). CONTAINMENT-2 (D1): refused on every platform, so a workspace stays portable.
 */
export function isWindowsHostileName(name: string): boolean {
  return WINDOWS_DEVICE_STEM.test(name.split(".")[0]!) || /[. ]$/.test(name);
}

/**
 * A user-chosen name used as ONE plain path component directly under `baseDir`: the resolved child path, or undefined
 * when the name is not a string, is empty, "." or "..", holds a separator ('/' or '\'), a colon (a drive or an NTFS
 * stream) or NUL, is a Windows-hostile name (see isWindowsHostileName), or would not resolve directly under baseDir.
 * A logical check only, with no I/O: a caller that touches the disk also refuses a link out of its own root.
 */
export function plainChildPath(baseDir: string, name: unknown): string | undefined {
  if (typeof name !== "string" || name === "" || name === "." || name === ".." || /[\\/:\0]/.test(name)) return undefined;
  if (isWindowsHostileName(name)) return undefined;
  const base = path.resolve(baseDir);
  const child = path.resolve(base, name);
  return path.dirname(child) === base ? child : undefined;
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
  const tempPath = path.join(dir, `.tmp.${base}.${crypto.randomUUID()}`);

  let fd: number | null = null;

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fd = fs.openSync(tempPath, "w", options.mode);
    const buffer =
      typeof data === "string" ? Buffer.from(data, options.encoding || "utf-8") : data;
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
      } catch (e: unknown) {
        attempts++;
        if (attempts >= maxAttempts) throw e;
        if ((e as any).code === "EPERM" || (e as any).code === "EBUSY") {
          EnvironmentTelemetry.logAnomaly(
            "FS_RETRY",
            "low",
            "fs",
            `Retrying rename sync of ${targetPath} due to ${(e as any).code}`
          );
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
  } catch (err: unknown) {
    throw new HardkasError(
      "IO_ERROR",
      `Failed to write file atomically (sync): ${targetPath}`,
      { cause: err }
    );
  } finally {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {
        /* ignore */
      }
    }
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (e) {
        /* ignore */
      }
    }
  }
}
