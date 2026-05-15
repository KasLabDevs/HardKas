// SAFETY_LEVEL: RESEARCH_EXPERIMENTAL
//
// Core types for GHOSTDAG simulation.
// Translated from kaspa-sim/src/consensus_core/types.rs
//
// This is a structural approximation only.
// No semantic equivalence with rusty-kaspa is claimed.
//
// Source: consensus/src/model/stores/ghostdag.rs

/**
 * Block hash as 64-char hex string.
 * In simulation, derived via SHA-256 of block parameters.
 * NOT a real Kaspa block hash — simulation IDs only.
 */
export type BlockHash = string;

/**
 * Accumulated PoW work as bigint.
 * rusty-kaspa uses U256; we use bigint (arbitrary precision in JS).
 */
export type BlueWorkType = bigint;

export const GENESIS_HASH: BlockHash = "0".repeat(64);

/**
 * Full GHOSTDAG data for a block.
 *
 * Source: consensus/src/model/stores/ghostdag.rs lines 22-30
 * [UNVALIDATED]: field semantics are structurally plausible
 * but not fixture-validated against rusty-kaspa.
 */
export interface GhostdagData {
  /** Count of blue blocks in the causal past, including this block's mergeset blues. */
  readonly blueScore: number;
  /** Cumulative PoW work of all blue blocks in causal past. */
  readonly blueWork: BlueWorkType;
  /** Parent with highest (blueWork, hash). */
  readonly selectedParent: BlockHash;
  /** Blue blocks in mergeset, ascending (blueWork, hash). First = selected parent. */
  readonly mergesetBlues: readonly BlockHash[];
  /** Red blocks in mergeset, ascending (blueWork, hash). */
  readonly mergesetReds: readonly BlockHash[];
  /** Anticone sizes for each blue in mergesetBlues. */
  readonly bluesAnticoneSizes: readonly number[];
}

/**
 * Compact projection for chain-walking.
 * Source: consensus/src/model/stores/ghostdag.rs lines 32-37
 */
export interface CompactGhostdagData {
  readonly blueScore: number;
  readonly blueWork: BlueWorkType;
  readonly selectedParent: BlockHash;
}

/**
 * Simulated block header (simulation layer only — not Kaspa wire format).
 */
export interface SimBlockHeader {
  readonly hash: BlockHash;
  readonly parents: readonly BlockHash[];
  readonly timestampUs: number;
  readonly minerId: number;
  /** Compact difficulty target. Work = BigInt(2**128) / BigInt(bits + 1). */
  readonly bits: number;
  readonly nonce: number;
}

/**
 * A block as seen by the simulation (header + optional GHOSTDAG result).
 */
export interface SimBlock {
  readonly header: SimBlockHeader;
  readonly ghostdag?: GhostdagData;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function blockHash(block: SimBlock): BlockHash {
  return block.header.hash;
}

export function blockParents(block: SimBlock): readonly BlockHash[] {
  return block.header.parents;
}

export function blockBlueWork(block: SimBlock): BlueWorkType {
  return block.ghostdag?.blueWork ?? 0n;
}

export function blockBlueScore(block: SimBlock): number {
  return block.ghostdag?.blueScore ?? 0;
}

/**
 * Simulated work contribution from header bits.
 * [UNVALIDATED]: approximates calc_work(bits) from rusty-kaspa.
 */
const MAX_WORK = 2n ** 128n;
export function headerWork(header: SimBlockHeader): BlueWorkType {
  return MAX_WORK / (BigInt(header.bits) + 1n);
}

export function compactFromFull(g: GhostdagData): CompactGhostdagData {
  return {
    blueScore: g.blueScore,
    blueWork: g.blueWork,
    selectedParent: g.selectedParent,
  };
}
