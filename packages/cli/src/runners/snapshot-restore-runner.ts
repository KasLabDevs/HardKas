import { UI } from "../ui.js";
import { 
  loadOrCreateLocalnetState, 
  restoreLocalnetSnapshot, 
  saveLocalnetState,
  calculateStateHash 
} from "@hardkas/localnet";

export interface SnapshotRestoreOptions {
  idOrName: string;
}

export async function runSnapshotRestore(options: SnapshotRestoreOptions) {
  try {
    const state = await loadOrCreateLocalnetState();
    const preHash = calculateStateHash(state);

    UI.header(`Restoring Snapshot: ${options.idOrName}`);

    const nextState = restoreLocalnetSnapshot(state, options.idOrName);
    const postHash = calculateStateHash(nextState);

    await saveLocalnetState(nextState);

    UI.success("Snapshot Restored Successfully");
    console.log(`  Previous State Hash: ${preHash.slice(0, 16)}...`);
    console.log(`  New State Hash:      ${postHash.slice(0, 16)}...`);
    console.log(`  DAA Score:           ${nextState.daaScore}`);

  } catch (e: any) {
    UI.error(`Restore failed: ${e.message}`);
    process.exitCode = 1;
  }
}
