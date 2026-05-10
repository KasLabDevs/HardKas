import { UI } from "../ui.js";
import { loadOrCreateLocalnetState, verifySnapshot } from "@hardkas/localnet";

export interface SnapshotVerifyOptions {
  idOrName: string;
}

export async function runSnapshotVerify(options: SnapshotVerifyOptions) {
  try {
    const state = await loadOrCreateLocalnetState();
    const snapshot = state.snapshots?.find(
      (s: any) => s.id === options.idOrName || s.name === options.idOrName || s.contentHash === options.idOrName
    );

    if (!snapshot) {
      UI.error(`Snapshot not found: ${options.idOrName}`);
      process.exitCode = 1;
      return;
    }

    UI.header(`Snapshot Verification: ${snapshot.name || snapshot.contentHash}`);
    
    const result = verifySnapshot(snapshot);

    if (result.ok) {
      UI.success("Snapshot Integrity Verified");
      console.log(`  Accounts Hash:  ✓ MATCH (${snapshot.accountsHash?.slice(0, 8)}...)`);
      console.log(`  UTXO Set Hash:  ✓ MATCH (${snapshot.utxoSetHash?.slice(0, 8)}...)`);
      console.log(`  State Hash:     ✓ MATCH (${snapshot.stateHash?.slice(0, 8)}...)`);
      console.log(`  Content Hash:   ✓ MATCH (${snapshot.contentHash?.slice(0, 8)}...)`);
    } else {
      UI.error("Snapshot Integrity Compromised");
      result.errors.forEach(err => console.log(`  [!] ${err}`));
      process.exitCode = 1;
    }
  } catch (e: any) {
    UI.error(`Verification failed: ${e.message}`);
    process.exitCode = 1;
  }
}
