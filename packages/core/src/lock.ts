import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { HardkasError } from "./index.js";

/**
 * HardKAS Lock Metadata schema v1
 */
export interface LockMetadata {
  schema: "hardkas.lock.v1";
  name: string;
  pid: number;
  command: string;
  cwd: string;
  hostname: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface LockHandle {
  readonly path: string;
  readonly metadata: LockMetadata;
  release(): Promise<void>;
}

export interface AcquireLockArgs {
  rootDir: string;
  name: string;
  command?: string;
  staleMs?: number;
  wait?: boolean;
  timeoutMs?: number;
  pollMs?: number;
}

/**
 * Deterministic lock ordering to avoid deadlocks.
 * workspace > node > accounts > artifacts > events > query-store
 */
export const LOCK_ORDER = [
  "workspace",
  "node",
  "accounts",
  "artifacts",
  "events",
  "query-store"
];

/**
 * Acquires a named lock for the workspace.
 */
export async function acquireLock(args: AcquireLockArgs): Promise<LockHandle> {
  const lockDir = path.join(args.rootDir, ".hardkas", "locks");
  const lockPath = path.join(lockDir, `${args.name}.lock`);
  const timeoutMs = args.timeoutMs ?? 30000;
  const pollMs = args.pollMs ?? 250;
  const start = Date.now();

  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }

  while (true) {
    try {
      // 1. Attempt atomic creation
      const metadata: LockMetadata = {
        schema: "hardkas.lock.v1",
        name: args.name,
        pid: process.pid,
        command: args.command || process.argv.join(" "),
        cwd: process.cwd(),
        hostname: os.hostname(),
        createdAt: new Date().toISOString(),
        expiresAt: null
      };

      const fd = fs.openSync(lockPath, "wx");
      fs.writeSync(fd, JSON.stringify(metadata, null, 2));
      fs.closeSync(fd);

      return {
        path: lockPath,
        metadata,
        release: async () => {
          if (fs.existsSync(lockPath)) {
            try {
              const current = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as LockMetadata;
              if (current.pid === process.pid) {
                fs.unlinkSync(lockPath);
              }
            } catch (e) {
              // Ignore invalid metadata on release, but don't delete if not ours
            }
          }
        }
      };
    } catch (e: any) {
      if (e.code === "EEXIST") {
        // Lock exists. Check liveness/staleness.
        let existingMetadata: LockMetadata | null = null;
        try {
          existingMetadata = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
        } catch (err) {
          throw new HardkasError("LOCK_METADATA_INVALID", `Lock file at ${lockPath} is corrupted.`, { cause: err });
        }

        if (existingMetadata) {
          // Process liveness check
          const isAlive = isProcessAlive(existingMetadata.pid);
          if (!isAlive) {
            // Stale lock detected
            throw new HardkasError(
              "STALE_LOCK",
              `Workspace is locked by a dead process (PID: ${existingMetadata.pid}).`,
              { cause: existingMetadata }
            );
          }

          // Lock is held by a live process
          if (args.wait && Date.now() - start < timeoutMs) {
            await new Promise(resolve => setTimeout(resolve, pollMs));
            continue;
          }

          throw new HardkasError(
            args.wait ? "LOCK_TIMEOUT" : "LOCK_HELD",
            `Workspace is locked by another HardKAS process (PID: ${existingMetadata.pid}).`,
            { cause: existingMetadata }
          );
        }
      }
      throw e;
    }
  }
}

/**
 * Helper to run a task with a single lock.
 */
export async function withLock<T>(
  args: AcquireLockArgs,
  fn: (handle: LockHandle) => Promise<T>
): Promise<T> {
  const handle = await acquireLock(args);
  try {
    return await fn(handle);
  } finally {
    await handle.release();
  }
}

/**
 * Helper to run a task with multiple locks in deterministic order.
 */
export async function withLocks<T>(
  rootDir: string,
  names: string[],
  fn: () => Promise<T>,
  options: { command?: string; wait?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  // Sort names according to LOCK_ORDER
  const sortedNames = [...names].sort((a, b) => {
    const idxA = LOCK_ORDER.indexOf(a);
    const idxB = LOCK_ORDER.indexOf(b);
    return idxA - idxB;
  });

  const handles: LockHandle[] = [];
  try {
    for (const name of sortedNames) {
      handles.push(await acquireLock({ rootDir, name, ...options }));
    }
    return await fn();
  } finally {
    // Release in reverse order
    for (const handle of handles.reverse()) {
      await handle.release();
    }
  }
}

/**
 * Checks if a process is alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    // signal 0 does not kill the process but performs error checking
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    // ESRCH means process not found
    return e.code !== "ESRCH";
  }
}

/**
 * Lists all active locks in the workspace.
 */
export function listLocks(rootDir: string): Array<{ name: string; metadata: LockMetadata; path: string; isAlive: boolean }> {
  const lockDir = path.join(rootDir, ".hardkas", "locks");
  if (!fs.existsSync(lockDir)) return [];
  
  const files = fs.readdirSync(lockDir).filter(f => f.endsWith(".lock"));
  const result = [];
  
  for (const file of files) {
    const lockPath = path.join(lockDir, file);
    try {
      const metadata = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as LockMetadata;
      result.push({ 
        name: path.basename(file, ".lock"), 
        metadata, 
        path: lockPath,
        isAlive: metadata.hostname === os.hostname() ? isProcessAlive(metadata.pid) : true // Assume alive if remote
      });
    } catch (e) {
      // Corrupt lock metadata
    }
  }
  return result;
}

/**
 * Safely clears a lock if criteria are met.
 */
export function clearLock(
  rootDir: string, 
  name: string, 
  options: { force?: boolean, ifDead?: boolean } = {}
): { cleared: boolean; reason?: string } {
  const lockDir = path.join(rootDir, ".hardkas", "locks");
  const lockPath = path.join(lockDir, `${name}.lock`);
  
  if (!fs.existsSync(lockPath)) return { cleared: false, reason: "Lock not found" };
  
  let metadata: LockMetadata;
  try {
    metadata = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
  } catch (e) {
    if (options.force) {
      fs.unlinkSync(lockPath);
      return { cleared: true };
    }
    return { cleared: false, reason: "Corrupt metadata (use --force to clear)" };
  }
  
  const isLocal = metadata.hostname === os.hostname();
  const isAlive = isLocal ? isProcessAlive(metadata.pid) : true;
  
  if (options.ifDead) {
    if (!isLocal) return { cleared: false, reason: "Cannot verify liveness of remote lock (host: " + metadata.hostname + ")" };
    if (isAlive) return { cleared: false, reason: `Process (PID: ${metadata.pid}) is still alive` };
  } else if (!options.force) {
    return { cleared: false, reason: "Lock is potentially active. Use --force or --if-dead." };
  }
  
  fs.unlinkSync(lockPath);
  return { cleared: true };
}
