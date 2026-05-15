// SAFETY_LEVEL: RESEARCH_EXPERIMENTAL
//
// In-memory GHOSTDAG store.
// Translated from kaspa-sim/src/consensus_core/store.rs
//
// Source: consensus/src/model/stores/ghostdag.rs lines 392-514
//
// This is a structural approximation only.
// No semantic equivalence with rusty-kaspa is claimed.

import type {
  BlockHash,
  BlueWorkType,
  CompactGhostdagData,
  GhostdagData,
} from "./ghostdag-types.js";
import { compactFromFull, GENESIS_HASH } from "./ghostdag-types.js";

/**
 * In-memory GHOSTDAG data store.
 * Mirrors MemoryGhostdagStore in rusty-kaspa.
 */
export class GhostdagStore {
  private readonly full = new Map<BlockHash, GhostdagData>();
  private readonly compact = new Map<BlockHash, CompactGhostdagData>();

  /**
   * Insert full + compact entries atomically.
   * Source: ghostdag.rs insert_batch() / update_batch() write both.
   */
  insert(hash: BlockHash, data: GhostdagData): void {
    this.compact.set(hash, compactFromFull(data));
    this.full.set(hash, data);
  }

  getData(hash: BlockHash): GhostdagData | undefined {
    return this.full.get(hash);
  }

  getBlueScore(hash: BlockHash): number | undefined {
    return this.compact.get(hash)?.blueScore;
  }

  getBlueWork(hash: BlockHash): BlueWorkType | undefined {
    return this.compact.get(hash)?.blueWork;
  }

  getSelectedParent(hash: BlockHash): BlockHash | undefined {
    return this.compact.get(hash)?.selectedParent;
  }

  has(hash: BlockHash): boolean {
    return this.compact.has(hash);
  }

  get size(): number {
    return this.full.size;
  }
}

/**
 * Genesis GHOSTDAG data.
 * [UNVALIDATED]: genesis blue_score=0, blue_work=0, selected_parent=genesis.
 */
export function genesisGhostdagData(genesisHash: BlockHash = GENESIS_HASH): GhostdagData {
  return {
    blueScore: 0,
    blueWork: 0n,
    selectedParent: genesisHash,
    mergesetBlues: [genesisHash],
    mergesetReds: [],
    bluesAnticoneSizes: [0],
  };
}
