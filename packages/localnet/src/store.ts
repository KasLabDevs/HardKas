import fs from "node:fs/promises";
import path from "node:path";
import type { LocalnetState } from "./types.js";
import { createInitialLocalnetState } from "./state.js";
import { withLock, writeFileAtomic } from "@hardkas/core";

/** The lock that serializes a workspace's simulated state (SIMULATOR-EXECUTION-UNIT-1). */
export const SIMULATOR_STATE_LOCK = "simulator-state";

/**
 * SIMULATOR-EXECUTION-UNIT-1: two cooperative operations never interleave the read → modify → write of the same
 * simulated state (`<workspace>/.hardkas/localnet.json`) nor its derived evidence. fn runs as one unit under the
 * workspace's `simulator-state` lock, which the writes it makes join (reentrant within its call chain). In LOCK_ORDER it
 * comes before `artifacts`: never take it while holding the store.
 */
export function withSimulatorState<T>(workspaceRoot: string, fn: () => Promise<T>): Promise<T> {
  return withLock({ rootDir: workspaceRoot, name: SIMULATOR_STATE_LOCK, command: "simulated state", wait: true }, fn);
}

/** The workspace whose simulated state a state file is (`<workspace>/.hardkas/localnet.json`); undefined for a copy elsewhere. */
function simulatedStateWorkspace(statePath: string): string | undefined {
  const dir = path.dirname(path.resolve(statePath));
  return path.basename(dir) === ".hardkas" ? path.dirname(dir) : undefined;
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
  const workspace = simulatedStateWorkspace(targetPath);
  if (!workspace) return writeLocalnetState(state, targetPath); // a copy elsewhere (an export) is no workspace's state
  // SIMULATOR-EXECUTION-UNIT-1: under `simulator-state` (joined when the caller holds it for a whole read → modify →
  // write), with the store taken before the state moves, so the state snapshot below is written at once
  const { ArtifactStoreMutation } = await import("@hardkas/artifacts");
  return withSimulatorState(workspace, () =>
    new ArtifactStoreMutation(workspace).hold(() => writeLocalnetState(state, targetPath), "simulated state")
  );
}

async function writeLocalnetState(state: LocalnetState, targetPath: string): Promise<void> {
  const dir = path.dirname(targetPath);

  // the state file normally lives outside the artifact store; one pointed inside it goes through the store's gate
  // (ARTIFACT-MUTATION-1)
  const { ensureDirRespectingStore, writeFileRespectingStore } = await import("@hardkas/artifacts");
  const data = JSON.stringify(state, null, 2);
  await ensureDirRespectingStore(dir);
  await writeFileRespectingStore(targetPath, data, () => writeFileAtomic(targetPath, data, { encoding: "utf-8" }));

  // Also persist as canonical snapshot artifact for lineage resolution
  let workspaceRoot = dir;
  while(workspaceRoot !== path.dirname(workspaceRoot)) {
    if (path.basename(workspaceRoot) === ".hardkas") {
      workspaceRoot = path.dirname(workspaceRoot);
      break;
    }
    workspaceRoot = path.dirname(workspaceRoot);
  }
  const { ProjectArtifactStore, calculateContentHash, CURRENT_HASH_VERSION, sortUtxosByOutpoint } = await import("@hardkas/artifacts");

  try {
    const store = new ProjectArtifactStore(workspaceRoot);
    const snapshotArtifact: any = {
      schema: "hardkas.snapshot.v1",
      hashVersion: CURRENT_HASH_VERSION,
      createdAt: new Date().toISOString(),
      daaScore: state.daaScore,
      accountsHash: (await import("./snapshot.js")).calculateAccountsHash(state.accounts),
      utxoSetHash: (await import("./snapshot.js")).calculateUtxoSetHash(state.utxos),
      hardkasVersion: state.hardkasVersion,
      version: state.version,
      networkId: state.networkId,
      mode: state.mode,
      accounts: [...state.accounts].sort((a, b) => {
        if (a.address > b.address) return 1;
        if (a.address < b.address) return -1;
        return 0;
      }),
      utxos: sortUtxosByOutpoint(state.utxos)
    };

    const stateHash = (await import("./snapshot.js")).calculateStateHash(state);
    snapshotArtifact.stateHash = stateHash;

    // One pass, nothing added afterwards (IC-1′.4). The snapshot's identity is its
    // contentHash; no unauthenticated copy is written next to it (IC-7.3).
    const contentHash = calculateContentHash(snapshotArtifact, CURRENT_HASH_VERSION);
    snapshotArtifact.contentHash = contentHash;

    // Write it as an artifact so the resolver can find it via lineage
    await store.writeArtifact(snapshotArtifact);
  } catch (e) {
    // Ignore if not in a full HardKAS project workspace
  }
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
