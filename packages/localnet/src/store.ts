import fs from "node:fs/promises";
import path from "node:path";
import type { LocalnetState } from "./types.js";
import { createInitialLocalnetState } from "./state.js";
import { writeFileAtomic } from "@hardkas/core";

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
  const dir = path.dirname(targetPath);

  await fs.mkdir(dir, { recursive: true });
  await writeFileAtomic(targetPath, JSON.stringify(state, null, 2), {
    encoding: "utf-8"
  });

  // Also persist as canonical snapshot artifact for lineage resolution
  const workspaceRoot = path.dirname(dir); // Typically dir is .hardkas so workspaceRoot is its parent
  const { ProjectArtifactStore, calculateContentHash, CURRENT_HASH_VERSION, sortUtxosByOutpoint } = await import("@hardkas/artifacts");

  try {
    const store = new ProjectArtifactStore(workspaceRoot);
    const snapshotArtifact: any = {
      schema: "hardkas.snapshot.v1",
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

    const contentHash = calculateContentHash(snapshotArtifact, CURRENT_HASH_VERSION);
    snapshotArtifact.artifactId = contentHash;
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
    const legacyPath = path.join(path.dirname(targetPath), "localnet-state.json");
    try {
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
    state = createInitialLocalnetState({
      accounts: options.accounts,
      initialBalanceSompi: options.initialBalanceSompi
    });
    await saveLocalnetState(state, statePath);
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
