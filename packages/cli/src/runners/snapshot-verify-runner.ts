import { UI } from "../ui.js";
import { loadOrCreateLocalnetState, verifySnapshot } from "@hardkas/localnet";

export interface SnapshotVerifyOptions {
  idOrName: string;
  workspaceRoot: string;
  json?: boolean;
}

export async function runSnapshotVerify(options: SnapshotVerifyOptions) {
  try {
    const { Hardkas } = await import("@hardkas/sdk");
    const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
    const state = await loadOrCreateLocalnetState({ cwd: options.workspaceRoot });
    const snapshot = state.snapshots?.find(
      (s: any) =>
        s.id === options.idOrName ||
        s.name === options.idOrName ||
        s.contentHash === options.idOrName
    );

    if (!snapshot) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(
        "SNAPSHOT_NOT_FOUND",
        `Snapshot not found: ${options.idOrName}`,
        { exitCode: 1 }
      );
    }

    UI.header(`Snapshot Verification: ${snapshot.name || snapshot.contentHash}`);

    const result = verifySnapshot(snapshot);

    if (result.ok) {
      UI.success("Snapshot Integrity Verified");
      console.log(
        `  Accounts Hash:  âœ“ MATCH (${snapshot.accountsHash?.slice(0, 8)}...)`
      );
      console.log(
        `  UTXO Set Hash:  âœ“ MATCH (${snapshot.utxoSetHash?.slice(0, 8)}...)`
      );
      console.log(`  State Hash:     âœ“ MATCH (${snapshot.stateHash?.slice(0, 8)}...)`);
      console.log(
        `  Content Hash:   âœ“ MATCH (${snapshot.contentHash?.slice(0, 8)}...)`
      );
    } else {
      result.errors.forEach((err) => console.log(`  [!] ${err}`));
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(
        "SNAPSHOT_COMPROMISED",
        "Snapshot Integrity Compromised",
        { exitCode: 1 }
      );
    }
  } catch (e: unknown) {
    if (((e as any).name) === "HardkasCliError") throw e;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "VERIFICATION_FAILED",
      `Verification failed: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`,
      { exitCode: 1 }
    );
  }
}
