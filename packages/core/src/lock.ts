import { HardkasSchemas } from "./registry.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AsyncLocalStorage } from "node:async_hooks";
import { HardkasError } from "./index.js";
import { EnvironmentTelemetry } from "./telemetry.js";

/**
 * HardKAS Lock Metadata schema v1
 */
export interface LockMetadata {
  schema: typeof HardkasSchemas.LockV1;
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
 * ARTIFACT-LOCK-REENTRANCY-1: one lock file held by this process. Its handles are shares of it, released once each, and
 * the file goes with the last share — only if it is still exactly the file this holding wrote. Holdings are visible to
 * the call chain running inside them (withLock/withLocks) through one AsyncLocalStorage shared by every copy of this
 * module in the process: a nested acquisition joins, while another process or an independent operation of this same
 * process is excluded as before.
 */
interface Holding {
  readonly key: string;
  readonly lockPath: string;
  readonly content: string;
  readonly metadata: LockMetadata;
  shares: number;
}

const HOLDING_SCOPE = Symbol.for("@hardkas/core/lock-holding-scope.v1");
const HOLDING_OF = Symbol.for("@hardkas/core/lock-holding.v1");
const holdingScope: AsyncLocalStorage<ReadonlyMap<string, Holding>> =
  ((globalThis as any)[HOLDING_SCOPE] ??= new AsyncLocalStorage<ReadonlyMap<string, Holding>>());

/** Canonical identity of a lock: the real path of the workspace's lock directory plus the lock name. */
function holdingKey(lockDir: string, name: string): string {
  let dir = lockDir;
  try {
    dir = fs.realpathSync.native(lockDir);
  } catch {
    // keep the resolved path
  }
  return path.join(dir, `${name}.lock`);
}

function readLockFile(lockPath: string): string | undefined {
  try {
    return fs.readFileSync(lockPath, "utf-8");
  } catch {
    return undefined;
  }
}

function shareOf(holding: Holding): LockHandle {
  let released = false;
  const handle: LockHandle = {
    path: holding.lockPath,
    metadata: holding.metadata,
    release: async () => {
      if (released) return; // a share is released once; a repeated release never drops another share
      released = true;
      holding.shares--;
      if (holding.shares > 0) return;
      // never remove a file this holding did not write (replaced or recovered by someone else)
      if (readLockFile(holding.lockPath) === holding.content) {
        try {
          fs.unlinkSync(holding.lockPath);
        } catch {
          // as before: a failed unlink leaves a lock naming this (live) process
        }
      }
    }
  };
  Object.defineProperty(handle, HOLDING_OF, { value: holding, enumerable: false });
  return handle;
}

/** Runs fn inside the holdings of these handles, so acquisitions in its call chain join them. */
function runInHoldings<T>(handles: LockHandle[], fn: () => Promise<T>): Promise<T> {
  const scope = new Map(holdingScope.getStore() ?? []);
  for (const handle of handles) {
    const holding = (handle as any)[HOLDING_OF] as Holding | undefined;
    if (holding) scope.set(holding.key, holding);
  }
  return holdingScope.run(scope, fn);
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
  "pending-spends",
  "query-store"
];

/**
 * Acquires a named lock for the workspace.
 * Supports automatic stale lock recovery when the holding process is dead.
 */
export async function acquireLock(args: AcquireLockArgs): Promise<LockHandle> {
  const lockDir = path.join(args.rootDir, ".hardkas", "locks");
  const lockPath = path.join(lockDir, `${args.name}.lock`);
  const timeoutMs = args.timeoutMs ?? 30000;
  const pollMs = args.pollMs ?? 250;
  const start = Date.now();
  let staleRecoveryAttempted = false;

  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }

  // ARTIFACT-LOCK-REENTRANCY-1: an acquisition made inside a holding of this lock (its call chain) joins it
  const key = holdingKey(lockDir, args.name);
  const held = holdingScope.getStore()?.get(key);
  if (held && held.shares > 0) {
    if (readLockFile(lockPath) !== held.content) {
      throw new HardkasError(
        "LOCK_LOST",
        `Lock ${args.name} at ${lockPath} was removed or replaced from outside while this process held it; a nested acquisition cannot join it`
      );
    }
    held.shares++;
    return shareOf(held);
  }

  while (true) {
    try {
      // 1. Attempt atomic creation
      const metadata: LockMetadata = {
        schema: HardkasSchemas.LockV1,
        name: args.name,
        pid: process.pid,
        command: args.command || process.argv.join(" "),
        cwd: process.cwd(),
        hostname: os.hostname(),
        createdAt: new Date().toISOString(),
        expiresAt: null
      };

      const content = JSON.stringify(metadata, null, 2);
      const fd = fs.openSync(lockPath, "wx");
      fs.writeSync(fd, content);
      fs.closeSync(fd);

      return shareOf({ key, lockPath, content, metadata, shares: 1 });
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") {
        // Lock exists. Check liveness/staleness.
        let existingMetadata: LockMetadata | null = null;
        try {
          existingMetadata = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
        } catch (err) {
          // Corrupted lock file - attempt recovery
          const LOCK_CREATION_GRACE_MS = 2000;
          let stats: fs.Stats | null = null;
          try {
            stats = fs.statSync(lockPath);
          } catch {
            // Lock disappeared
            continue;
          }

          const ageMs = Date.now() - stats.mtimeMs;
          if (ageMs < LOCK_CREATION_GRACE_MS) {
            // "In-flight" creation, not corrupt. Wait and retry.
            await new Promise((resolve) => setTimeout(resolve, pollMs));
            continue;
          }

          if (!staleRecoveryAttempted) {
            staleRecoveryAttempted = true;
            try {
              fs.unlinkSync(lockPath);
              EnvironmentTelemetry.logAnomaly(
                "STALE_LOCK_RECOVERY",
                "medium",
                "lock",
                `Recovered corrupted lock file at ${lockPath} (Age: ${ageMs}ms)`,
                args.rootDir
              );
              continue; // Retry acquisition
            } catch {
              throw new HardkasError(
                "LOCK_METADATA_INVALID",
                `Lock file at ${lockPath} is corrupted and cannot be recovered.`,
                { cause: err }
              );
            }
          }
          throw new HardkasError(
            "LOCK_METADATA_INVALID",
            `Lock file at ${lockPath} is corrupted.`,
            { cause: err }
          );
        }

        if (existingMetadata) {
          // Process liveness check
          const isLocal = existingMetadata.hostname === os.hostname();
          const isAlive = isLocal ? isProcessAlive(existingMetadata.pid) : true;

          if (!isAlive && !staleRecoveryAttempted) {
            // Stale lock detected - automatically recover and retry
            staleRecoveryAttempted = true;
            try {
              fs.unlinkSync(lockPath);
              EnvironmentTelemetry.logAnomaly(
                "STALE_LOCK_RECOVERY",
                "medium",
                "lock",
                `Recovered lock held by dead process (PID: ${existingMetadata.pid})`,
                args.rootDir
              );
              continue; // Retry acquisition after recovery
            } catch (unlinkErr) {
              throw new HardkasError(
                "STALE_LOCK",
                `Workspace is locked by a dead process (PID: ${existingMetadata.pid}). Failed to auto-recover: ${unlinkErr}`,
                { cause: existingMetadata }
              );
            }
          }

          if (!isAlive) {
            // Already attempted recovery once - don't retry forever
            throw new HardkasError(
              "STALE_LOCK",
              `Workspace is locked by a dead process (PID: ${existingMetadata.pid}).`,
              { cause: existingMetadata }
            );
          }

          // Lock is held by a live process
          if (args.wait && Date.now() - start < timeoutMs) {
            EnvironmentTelemetry.logAnomaly(
              "LOCK_CONTENTION",
              "low",
              "lock",
              `Waiting for lock ${args.name} held by PID ${existingMetadata.pid}`,
              args.rootDir
            );
            await new Promise((resolve) => setTimeout(resolve, pollMs));
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
    return await runInHoldings([handle], () => fn(handle));
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
    return await runInHoldings(handles, fn);
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
    return true; // 0 success -> alive
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "EPERM") return true; // Permission denied -> alive
    if ((e as NodeJS.ErrnoException).code === "ESRCH") return false; // Process not found -> dead

    // Windows might return other errors, treat as ambiguous (assume alive to prevent aggressive deletion)
    return true;
  }
}

/**
 * Lists all active locks in the workspace.
 */
export function listLocks(
  rootDir: string
): Array<{ name: string; metadata: LockMetadata; path: string; isAlive: boolean }> {
  const lockDir = path.join(rootDir, ".hardkas", "locks");
  if (!fs.existsSync(lockDir)) return [];

  const files = fs.readdirSync(lockDir).filter((f) => f.endsWith(".lock"));
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
  options: { force?: boolean; ifDead?: boolean } = {}
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
    if (!isLocal)
      return {
        cleared: false,
        reason: "Cannot verify liveness of remote lock (host: " + metadata.hostname + ")"
      };
    if (isAlive)
      return { cleared: false, reason: `Process (PID: ${metadata.pid}) is still alive` };
  } else if (!options.force) {
    return {
      cleared: false,
      reason: "Lock is potentially active. Use --force or --if-dead."
    };
  }

  fs.unlinkSync(lockPath);
  return { cleared: true };
}
