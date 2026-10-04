import fs from "node:fs/promises";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import type { LocalnetState } from "./types.js";
import { createInitialLocalnetState } from "./state.js";
import { HardkasError, withLock, writeFileAtomic } from "@hardkas/core";

/** The lock that serializes a workspace's simulated state (SIMULATOR-EXECUTION-UNIT-1). */
export const SIMULATOR_STATE_LOCK = "simulator-state";

// The workspaces whose simulated state the current call chain already holds (and has already settled). Shared by every
// copy of this module in the process, like the lock holdings themselves.
const SETTLED_SCOPE = Symbol.for("@hardkas/localnet/simulator-state-settled.v1");
const settledScope: AsyncLocalStorage<ReadonlySet<string>> =
  ((globalThis as any)[SETTLED_SCOPE] ??= new AsyncLocalStorage<ReadonlySet<string>>());

/**
 * SIMULATOR-EXECUTION-UNIT-1: two cooperative operations never interleave the read → modify → write of the same
 * simulated state (`<workspace>/.hardkas/localnet.json`) nor its derived evidence. fn runs as one unit under the
 * workspace's `simulator-state` lock, which the writes it makes join (reentrant within its call chain). In LOCK_ORDER it
 * comes before `artifacts`: never take it while holding the store.
 * SIMULATOR-RECOVERY-FIRST-1: the outermost acquisition settles a pending execution of the workspace before fn runs; if
 * that recovery cannot converge it throws and fn never runs, so no simulated mutation happens on top of it.
 */
export function withSimulatorState<T>(workspaceRoot: string, fn: () => Promise<T>): Promise<T> {
  return withLock({ rootDir: workspaceRoot, name: SIMULATOR_STATE_LOCK, command: "simulated state", wait: true }, async () => {
    const resolved = path.resolve(workspaceRoot);
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    const settled = settledScope.getStore();
    if (settled?.has(key)) return fn();
    const { recoverPendingExecution } = await import("./pending-execution.js");
    await recoverPendingExecution(workspaceRoot);
    return settledScope.run(new Set([...(settled ?? []), key]), fn);
  });
}

/** The workspace whose simulated state a state file is (`<workspace>/.hardkas/localnet.json`); undefined for a copy elsewhere. */
function simulatedStateWorkspace(statePath: string): string | undefined {
  const dir = path.dirname(path.resolve(statePath));
  return path.basename(dir) === ".hardkas" ? path.dirname(dir) : undefined;
}

/** The workspace whose `.hardkas` directory holds a state file at any depth (the nearest); undefined outside every one. */
function enclosingWorkspace(statePath: string): string | undefined {
  for (let dir = path.dirname(path.resolve(statePath)); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (path.basename(dir) === ".hardkas") return path.dirname(dir);
  }
  return undefined;
}

export function getDefaultLocalnetDir(cwd: string = process.cwd(), overrideHardkasDir?: string): string {
  if (overrideHardkasDir) {
    return overrideHardkasDir;
  }
  return path.join(cwd, ".hardkas");
}

export function getDefaultLocalnetStatePath(cwd: string = process.cwd(), overrideHardkasDir?: string): string {
  return path.join(getDefaultLocalnetDir(cwd, overrideHardkasDir), "localnet.json");
}

export async function saveLocalnetState(
  state: LocalnetState,
  filePath?: string
): Promise<void> {
  const targetPath = filePath ?? getDefaultLocalnetStatePath();
  // SIMULATOR-DURABLE-EXECUTION-1: a pending execution record is only ever written by the execution that commits it; a
  // state read before it was settled (a copy carried by `...state`) never brings it back
  const { pendingExecution: _carried, ...plain } = state;
  const workspace = simulatedStateWorkspace(targetPath);
  if (!workspace) {
    // not a workspace's own state file: no simulator-state unit. Its snapshot still goes first to the store of the
    // workspace whose `.hardkas` holds the file (a scenario run's state under `.hardkas/runs/<id>/`); a file outside every
    // `.hardkas` (an export) gets none, never the filesystem root's (STATE-EXPORT-ROOT-SNAPSHOT-1 decides later)
    const enclosing = enclosingWorkspace(targetPath);
    return enclosing ? writeLocalnetState(plain, targetPath, enclosing) : writeLocalnetLedger(plain, targetPath);
  }
  // SIMULATOR-EXECUTION-UNIT-1: under `simulator-state` (joined when the caller holds it for a whole read → modify →
  // write), with the store taken before the state moves, so the state snapshot below is written at once
  const { ArtifactStoreMutation } = await import("@hardkas/artifacts");
  return withSimulatorState(workspace, () =>
    new ArtifactStoreMutation(workspace).hold(() => writeLocalnetState(plain, targetPath, workspace), "simulated state")
  );
}

/** Writes the state file only (atomically), with no derived evidence. */
export async function writeLocalnetLedger(state: LocalnetState, targetPath: string): Promise<void> {
  // the state file normally lives outside the artifact store; one pointed inside it goes through the store's gate
  // (ARTIFACT-MUTATION-1)
  const { ensureDirRespectingStore, writeFileRespectingStore } = await import("@hardkas/artifacts");
  const data = JSON.stringify(state, null, 2);
  await ensureDirRespectingStore(path.dirname(targetPath));
  await writeFileRespectingStore(targetPath, data, () => writeFileAtomic(targetPath, data, { encoding: "utf-8" }));
}

/**
 * SIMULATOR-STATE-EVIDENCE-1: a workspace's simulated state never becomes durable before its exact state snapshot
 * artifact is durable. The snapshot is published (or found) first; any failure there propagates, so the state file is
 * not written and the ledger stays as it was. (A simulated transaction's state goes through SIMULATOR-DURABLE-EXECUTION-1
 * instead, never through here.)
 */
async function writeLocalnetState(state: LocalnetState, targetPath: string, workspaceRoot: string): Promise<void> {
  await publishStateSnapshot(workspaceRoot, state);
  await writeLocalnetLedger(state, targetPath);
}

/**
 * The state snapshot artifact of `state` in the workspace's store (`misc/snapshot-<id>.json`, its identity is a function
 * of the state alone).
 * - Absent: built with the current clock (and the state's hardkasVersion) and written atomically through the gate.
 * - Present: it must first be a valid state snapshot (it verifies) of exactly this state (its identity). Then the two
 *   fields outside that identity, createdAt and hardkasVersion, are taken from it: the durable artifact, not the process
 *   that meets the state again (a retry, a reset, another HardKAS version), is their authority. The expected bytes are
 *   rebuilt with them and must be exactly the file's: then it is kept, never rewritten.
 * - Anything else at that path → STATE_SNAPSHOT_CONFLICT, and nothing is written.
 */
async function publishStateSnapshot(workspaceRoot: string, state: LocalnetState): Promise<void> {
  const { ArtifactStoreMutation, storeEntryFor } = await import("@hardkas/artifacts");
  const { buildStateSnapshotArtifact, verifySnapshot } = await import("./snapshot.js");
  const gate = new ArtifactStoreMutation(workspaceRoot);
  await gate.hold(async () => {
    const snapshot = buildStateSnapshotArtifact(state, new Date().toISOString());
    const { rel, content } = storeEntryFor(snapshot);
    let existing: string;
    try {
      existing = await fs.readFile(path.join(gate.storeDir, rel), "utf-8");
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
      await gate.writeFile(rel, content);
      return;
    }
    const refuse = (what: string) =>
      new HardkasError("STATE_SNAPSHOT_CONFLICT", `${rel} already holds ${what}; it was left as it is and the simulated state was not changed`);
    let found: any;
    try {
      found = JSON.parse(existing);
    } catch {
      throw refuse("content that is not JSON");
    }
    if (found?.schema !== snapshot.schema) throw refuse("other content");
    let verifies = false;
    try {
      verifies = verifySnapshot(found).ok;
    } catch {
      verifies = false;
    }
    if (!verifies) throw refuse("a state snapshot that does not verify");
    if (found.contentHash !== snapshot.contentHash) throw refuse("another state's snapshot");
    const { createdAt, hardkasVersion } = found;
    if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt)) || typeof hardkasVersion !== "string" || hardkasVersion === "") {
      throw refuse("this state's snapshot with an invalid createdAt or hardkasVersion");
    }
    if (storeEntryFor(buildStateSnapshotArtifact({ ...state, hardkasVersion }, createdAt)).content !== existing) {
      throw refuse("this state's identity with other bytes");
    }
    // this state was evidenced before: its snapshot is kept exactly as it is
  }, "simulated state snapshot");
}

export async function loadLocalnetState(
  filePath?: string
): Promise<LocalnetState | null> {
  const targetPath = filePath ?? getDefaultLocalnetStatePath();

  try {
    const content = await fs.readFile(targetPath, "utf-8");
    return JSON.parse(content) as LocalnetState;
  } catch (error) {
    // If localnet.json not found, try migrating localnet-state.json
    try {
      const legacyPath = path.join(path.dirname(targetPath), "localnet-state.json");
      const legacyContent = await fs.readFile(legacyPath, "utf-8");
      // Migrate it over
      await fs.writeFile(targetPath, legacyContent, "utf-8");
      console.warn(
        `[HardKAS] Migrated legacy localnet-state.json to localnet.json. The old file was kept for compatibility.`
      );
      return JSON.parse(legacyContent) as LocalnetState;
    } catch {
      return null; // neither exists
    }
  }
}

export async function loadOrCreateLocalnetState(
  options: {
    cwd?: string;
    hardkasDir?: string;
    accounts?: number;
    initialBalanceSompi?: bigint;
  } = {}
): Promise<LocalnetState> {
  const statePath = getDefaultLocalnetStatePath(options.cwd, options.hardkasDir);
  let state = await loadLocalnetState(statePath);

  if (!state) {
    const create = async (): Promise<LocalnetState> => {
      // read again under the lock: a state another cooperative writer created meanwhile is kept, never replaced
      const existing = await loadLocalnetState(statePath);
      if (existing) return existing;
      const created = createInitialLocalnetState({
        accounts: options.accounts,
        initialBalanceSompi: options.initialBalanceSompi
      });
      await saveLocalnetState(created, statePath);
      return created;
    };
    const workspace = simulatedStateWorkspace(statePath);
    state = workspace ? await withSimulatorState(workspace, create) : await create();
  }

  return state;
}

export async function resetLocalnetState(
  options: {
    cwd?: string;
    hardkasDir?: string;
    accounts?: number;
    initialBalanceSompi?: bigint;
  } = {}
): Promise<LocalnetState> {
  const statePath = getDefaultLocalnetStatePath(options.cwd, options.hardkasDir);
  const state = createInitialLocalnetState({
    accounts: options.accounts,
    initialBalanceSompi: options.initialBalanceSompi
  });
  await saveLocalnetState(state, statePath);
  return state;
}
