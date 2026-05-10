import { 
  HARDKAS_VERSION, 
  ARTIFACT_VERSION,
  calculateContentHash,
  sortUtxosByOutpoint
} from "@hardkas/artifacts";
import type { LocalnetState, LocalnetAccount, LocalnetUtxo, SnapshotVerificationResult } from "./types.js";

/**
 * Calculates hash of the UTXO set (sorted by outpoint).
 */
export function calculateUtxoSetHash(utxos: LocalnetUtxo[]): string {
  const sorted = sortUtxosByOutpoint(utxos);
  return calculateContentHash(sorted);
}

/**
 * Calculates hash of the account set (sorted by address).
 */
export function calculateAccountsHash(accounts: LocalnetAccount[]): string {
  const sorted = [...accounts].sort((a, b) => a.address.localeCompare(b.address));
  return calculateContentHash(sorted);
}

/**
 * Calculates the state hash (daaScore + accountsHash + utxoSetHash).
 */
export function calculateStateHash(state: LocalnetState): string {
  const accountsHash = calculateAccountsHash(state.accounts);
  const utxoSetHash = calculateUtxoSetHash(state.utxos);
  
  return calculateContentHash({
    daaScore: state.daaScore,
    accountsHash,
    utxoSetHash
  });
}

/**
 * Creates a canonical deterministic snapshot.
 */
export function createLocalnetSnapshot(
  state: LocalnetState,
  name?: string
): LocalnetState {
  const accountsHash = calculateAccountsHash(state.accounts);
  const utxoSetHash = calculateUtxoSetHash(state.utxos);
  const stateHash = calculateStateHash(state);

  const snapshot: any = {
    schema: "hardkas.snapshot",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
    name,
    daaScore: state.daaScore,
    accountsHash,
    utxoSetHash,
    stateHash,
    accounts: JSON.parse(JSON.stringify(state.accounts)),
    utxos: JSON.parse(JSON.stringify(sortUtxosByOutpoint(state.utxos)))
  };

  snapshot.contentHash = calculateContentHash(snapshot);

  return {
    ...state,
    snapshots: [...(state.snapshots || []), snapshot]
  };
}

/**
 * Verifies the integrity of a snapshot.
 */
export function verifySnapshot(snapshot: any): SnapshotVerificationResult {
  const errors: string[] = [];
  
  // 1. Content Hash Verification
  const currentContentHash = calculateContentHash(snapshot);
  const contentMatch = snapshot.contentHash === currentContentHash;
  if (!contentMatch) errors.push(`Content hash mismatch: expected ${snapshot.contentHash}, got ${currentContentHash}`);

  // 2. Accounts Hash Verification
  const currentAccountsHash = calculateAccountsHash(snapshot.accounts);
  const accountsMatch = snapshot.accountsHash === currentAccountsHash;
  if (!accountsMatch) errors.push(`Accounts hash mismatch: expected ${snapshot.accountsHash}, got ${currentAccountsHash}`);

  // 3. UTXO Set Hash Verification
  const currentUtxoSetHash = calculateUtxoSetHash(snapshot.utxos);
  const utxoSetMatch = snapshot.utxoSetHash === currentUtxoSetHash;
  if (!utxoSetMatch) errors.push(`UTXO set hash mismatch: expected ${snapshot.utxoSetHash}, got ${currentUtxoSetHash}`);

  // 4. State Hash Verification
  const currentStateHash = calculateContentHash({
    daaScore: snapshot.daaScore,
    accountsHash: currentAccountsHash,
    utxoSetHash: currentUtxoSetHash
  });
  const stateMatch = snapshot.stateHash === currentStateHash;
  if (!stateMatch) errors.push(`State hash mismatch: expected ${snapshot.stateHash}, got ${currentStateHash}`);

  return {
    ok: errors.length === 0,
    hashes: {
      accountsMatch,
      utxoSetMatch,
      stateMatch,
      contentMatch
    },
    errors
  };
}

/**
 * Restores a snapshot with atomic safety and verification.
 */
export function restoreLocalnetSnapshot(
  state: LocalnetState,
  snapshotIdOrName: string
): LocalnetState {
  const snapshot = state.snapshots?.find(
    (s: any) => s.id === snapshotIdOrName || s.name === snapshotIdOrName || s.contentHash === snapshotIdOrName
  );

  if (!snapshot) {
    throw new Error(`Snapshot not found: ${snapshotIdOrName}`);
  }

  // 1. Verify before applying
  const verification = verifySnapshot(snapshot);
  if (!verification.ok) {
    throw new Error(`Corrupted snapshot: ${verification.errors.join(", ")}`);
  }

  // 2. Atomic return (no mutation of input state)
  return {
    ...state,
    daaScore: snapshot.daaScore,
    accounts: JSON.parse(JSON.stringify(snapshot.accounts)),
    utxos: JSON.parse(JSON.stringify(snapshot.utxos))
  };
}
