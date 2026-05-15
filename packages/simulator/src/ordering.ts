// SAFETY_LEVEL: RESEARCH_EXPERIMENTAL
//
// Block ordering for GHOSTDAG: (blueWork ASC, hash ASC).
// Translated from kaspa-sim/src/consensus_core/ordering.rs
//
// Source: consensus/src/processes/ghostdag/ordering.rs lines 14-51
//
// Verified behavior:
//   SortableBlock compare sorts by blueWork ascending, then hash ascending.
//   findSelectedParent = max of SortableBlock array
//     = block with HIGHEST (blueWork, hash).
//   sortBlocks = ascending sort = past-to-future ordering for mergeset processing.
//
// This is a structural approximation only.
// No semantic equivalence with rusty-kaspa is claimed.

import type { BlockHash, BlueWorkType } from "./ghostdag-types.js";

/**
 * Pairs a block hash with its blueWork for ordering.
 * Mirrors SortableBlock in rusty-kaspa ordering.rs lines 14-24.
 */
export interface SortableBlock {
  readonly hash: BlockHash;
  readonly blueWork: BlueWorkType;
}

/**
 * Compare two SortableBlocks: ascending by (blueWork, hash).
 * Returns negative if a < b, positive if a > b, 0 if equal.
 *
 * Source: ordering.rs lines 38-42
 */
export function compareSortableBlocks(a: SortableBlock, b: SortableBlock): number {
  if (a.blueWork < b.blueWork) return -1;
  if (a.blueWork > b.blueWork) return 1;
  // Tiebreak by hash (lexicographic, ascending)
  if (a.hash < b.hash) return -1;
  if (a.hash > b.hash) return 1;
  return 0;
}

/**
 * Sort blocks in ascending (blueWork, hash) order.
 * Source: ordering.rs lines 44-51 sort_blocks()
 *
 * Returns a NEW sorted array (does not mutate input).
 */
export function sortBlocks(blocks: readonly SortableBlock[]): SortableBlock[] {
  return [...blocks].sort(compareSortableBlocks);
}

/**
 * Find the selected parent: argmax over parents of (blueWork, hash).
 * Source: protocol.rs lines 99-106 find_selected_parent()
 *
 *   selected_parent = parents
 *     .map(p => SortableBlock { hash: p.hash, blueWork: p.blueWork })
 *     .max()
 *
 * Returns undefined only if parents is empty (invalid for any non-genesis block).
 */
export function findSelectedParent(
  parents: ReadonlyArray<{ hash: BlockHash; blueWork: BlueWorkType }>
): BlockHash | undefined {
  if (parents.length === 0) return undefined;

  let best: SortableBlock = { hash: parents[0]!.hash, blueWork: parents[0]!.blueWork };

  for (let i = 1; i < parents.length; i++) {
    const candidate: SortableBlock = { hash: parents[i]!.hash, blueWork: parents[i]!.blueWork };
    if (compareSortableBlocks(candidate, best) > 0) {
      best = candidate;
    }
  }

  return best.hash;
}
