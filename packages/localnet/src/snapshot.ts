import {
  HARDKAS_VERSION,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION,
  calculateContentHash,
  recomputeDeclaredContentHash,
  domainDigestForHashVersion,
  sortUtxosByOutpoint,
  type Snapshot
} from "@hardkas/artifacts";
import type {
  LocalnetState,
  LocalnetAccount,
  LocalnetUtxo,
  SnapshotVerificationResult
} from "./types.js";
import { deterministicCompare } from "@hardkas/core";

/**
 * Domain digests (utxoSetHash, accountsHash, stateHash) are NOT artifact
 * identities (Closure Pack IC-1′.7). They are computed by the dedicated
 * domain-digest function; the algorithm is selected by the hashVersion of the
 * artifact that carries them: ≤ 4 → the frozen legacy digest (only to verify and
 * replay legacy artifacts), 5 → the current digest. Nothing falls back.
 */
export interface DomainDigestOptions {
  /** The declared hashVersion of the artifact the digest belongs to (default: current). */
  hashVersion?: number;
}

const digestFor = (value: unknown, options?: DomainDigestOptions): string =>
  domainDigestForHashVersion(value, options?.hashVersion ?? CURRENT_HASH_VERSION);

/**
 * Calculates hash of the UTXO set (sorted by outpoint).
 */
export function calculateUtxoSetHash(utxos: LocalnetUtxo[], options?: DomainDigestOptions): string {
  const sorted = sortUtxosByOutpoint(utxos);
  return digestFor(sorted, options);
}

/**
 * Calculates hash of the account set (sorted by address).
 */
export function calculateAccountsHash(accounts: LocalnetAccount[], options?: DomainDigestOptions): string {
  const sorted = [...(accounts || [])].sort((a, b) =>
    deterministicCompare(a.address, b.address)
  );
  return digestFor(sorted, options);
}

/**
 * Calculates the state hash (daaScore + accountsHash + utxoSetHash).
 */
export function calculateStateHash(state: LocalnetState, options?: DomainDigestOptions): string {
  const accountsHash = calculateAccountsHash(state.accounts, options);
  const utxoSetHash = calculateUtxoSetHash(state.utxos, options);

  return digestFor(
    {
      daaScore: state.daaScore,
      accountsHash,
      utxoSetHash
    },
    options
  );
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

  const snapshotDraft: Omit<Snapshot, "contentHash"> = {
    schema: "hardkas.snapshot.v1",
    createdAt: new Date().toISOString(),
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    name,
    daaScore: state.daaScore,
    accountsHash,
    utxoSetHash,
    stateHash,
    accounts: JSON.parse(JSON.stringify(state.accounts)),
    utxos: JSON.parse(JSON.stringify(sortUtxosByOutpoint(state.utxos))),
    networkId: state.networkId,
    mode: state.mode
  };

  const snapshot: Snapshot = {
    ...snapshotDraft,
    contentHash: calculateContentHash(snapshotDraft, CURRENT_HASH_VERSION)
  };

  return {
    ...state,
    snapshots: [...(state.snapshots || []), snapshot]
  };
}

/**
 * Verifies the integrity of a snapshot. Every digest is recomputed with the
 * algorithm that belongs to the version the snapshot DECLARES.
 */
export function verifySnapshot(snapshot: Snapshot): SnapshotVerificationResult {
  const errors: string[] = [];

  // 1. Content Hash Verification (with the version the snapshot declares)
  let contentMatch = false;
  let digestOptions: DomainDigestOptions | undefined;
  try {
    const currentContentHash = recomputeDeclaredContentHash(snapshot);
    contentMatch = snapshot.contentHash === currentContentHash;
    if (!contentMatch)
      errors.push(
        `Content hash mismatch: expected ${snapshot.contentHash}, got ${currentContentHash}`
      );
    digestOptions = { hashVersion: snapshot.hashVersion as number };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      hashes: { accountsMatch: false, utxoSetMatch: false, stateMatch: false, contentMatch: false },
      errors
    };
  }

  // 2. Accounts Hash Verification
  const currentAccountsHash = calculateAccountsHash(snapshot.accounts, digestOptions);
  const accountsMatch = snapshot.accountsHash === currentAccountsHash;
  if (!accountsMatch)
    errors.push(
      `Accounts hash mismatch: expected ${snapshot.accountsHash}, got ${currentAccountsHash}`
    );

  // 3. UTXO Set Hash Verification
  const currentUtxoSetHash = calculateUtxoSetHash(snapshot.utxos, digestOptions);
  const utxoSetMatch = snapshot.utxoSetHash === currentUtxoSetHash;
  if (!utxoSetMatch)
    errors.push(
      `UTXO set hash mismatch: expected ${snapshot.utxoSetHash}, got ${currentUtxoSetHash}`
    );

  // 4. State Hash Verification
  const currentStateHash = digestFor(
    {
      daaScore: snapshot.daaScore,
      accountsHash: currentAccountsHash,
      utxoSetHash: currentUtxoSetHash
    },
    digestOptions
  );
  const stateMatch = snapshot.stateHash === currentStateHash;
  if (!stateMatch)
    errors.push(
      `State hash mismatch: expected ${snapshot.stateHash}, got ${currentStateHash}`
    );

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
    (s: Snapshot & { id?: string }) =>
      s.id === snapshotIdOrName ||
      s.name === snapshotIdOrName ||
      s.contentHash === snapshotIdOrName
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
