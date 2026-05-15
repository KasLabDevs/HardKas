// SAFETY_LEVEL: RESEARCH_EXPERIMENTAL
//
// BFS-based reachability and mergeset — structural approximation.
// Translated from kaspa-sim/src/research/approx_reachability.rs
//
// BFS reachability is a structural approximation until validated
// against rusty-kaspa. No semantic equivalence is claimed.
//
// Deviations:
//   1. rusty-kaspa uses O(1) reachability interval tree. We use O(|past|) BFS.
//   2. Mergeset BFS terminates via past_set membership (same logic, different impl).
//   3. Ordered mergeset uses sortBlocks() which is correct, but blue_work values
//      may differ from rusty-kaspa due to work formula approximation.

import type { BlockHash, SimBlock } from "./ghostdag-types.js";
import { GENESIS_HASH } from "./ghostdag-types.js";
import type { SortableBlock } from "./ordering.js";
import { sortBlocks } from "./ordering.js";
import type { GhostdagStore } from "./ghostdag-store.js";

// ── BFS Past Set ─────────────────────────────────────────────────────────────

/**
 * Compute the full past set of `start` via BFS.
 * [RESEARCH_EXPERIMENTAL]: O(|past(start)|) per call.
 * rusty-kaspa uses O(1) reachability interval tree.
 */
export function pastSet(
  start: BlockHash,
  allBlocks: ReadonlyMap<BlockHash, SimBlock>
): Set<BlockHash> {
  const past = new Set<BlockHash>();
  const queue: BlockHash[] = [start];
  past.add(start);

  while (queue.length > 0) {
    const h = queue.shift()!;
    const block = allBlocks.get(h);
    if (!block) continue;
    for (const p of block.header.parents) {
      if (!past.has(p)) {
        past.add(p);
        queue.push(p);
      }
    }
  }

  return past;
}

// ── Reachability ─────────────────────────────────────────────────────────────

/**
 * Check if `ancestorCandidate` is in the causal past of `descendant`.
 * [RESEARCH_EXPERIMENTAL]: BFS approximation of ReachabilityService.
 */
export function isDagAncestorOf(
  ancestorCandidate: BlockHash,
  descendant: BlockHash,
  allBlocks: ReadonlyMap<BlockHash, SimBlock>
): boolean {
  // Genesis is ancestor of everything by convention.
  if (ancestorCandidate === GENESIS_HASH) return true;
  return pastSet(descendant, allBlocks).has(ancestorCandidate);
}

// ── Mergeset ─────────────────────────────────────────────────────────────────

/**
 * Compute the unordered mergeset of `block`, excluding its `selectedParent`.
 *
 * Mergeset = blocks in past(block) that are NOT in past(selectedParent).
 * Genesis is never in the mergeset.
 *
 * [RESEARCH_EXPERIMENTAL]: BFS-based. Source: mergeset.rs lines 9-40
 */
export function unorderedMergesetWithoutSelectedParent(
  block: SimBlock,
  selectedParent: BlockHash,
  allBlocks: ReadonlyMap<BlockHash, SimBlock>
): BlockHash[] {
  const spPast = pastSet(selectedParent, allBlocks);

  const mergeset = new Set<BlockHash>();
  const queue: BlockHash[] = [];
  const visited = new Set<BlockHash>();

  // Seed with non-selected parents.
  for (const parent of block.header.parents) {
    if (parent === selectedParent) continue;
    if (spPast.has(parent)) continue;
    if (!visited.has(parent)) {
      visited.add(parent);
      mergeset.add(parent);
      queue.push(parent);
    }
  }

  // BFS backward.
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentBlock = allBlocks.get(current);
    if (!currentBlock) continue;

    for (const parent of currentBlock.header.parents) {
      if (parent === GENESIS_HASH) continue;
      if (visited.has(parent)) continue;
      visited.add(parent);
      if (spPast.has(parent)) continue;
      mergeset.add(parent);
      queue.push(parent);
    }
  }

  return Array.from(mergeset);
}

/**
 * Compute the mergeset sorted in ascending (blueWork, hash) order.
 * Source: mergeset.rs lines 43-45 ordered_mergeset_without_selected_parent()
 *
 * [RESEARCH_EXPERIMENTAL]: sorting semantics correct, blue_work values approximate.
 */
export function orderedMergesetWithoutSelectedParent(
  block: SimBlock,
  selectedParent: BlockHash,
  allBlocks: ReadonlyMap<BlockHash, SimBlock>,
  gdStore: GhostdagStore
): SortableBlock[] {
  const unordered = unorderedMergesetWithoutSelectedParent(
    block,
    selectedParent,
    allBlocks
  );

  const sortable: SortableBlock[] = unordered.map((hash) => ({
    hash,
    blueWork: gdStore.getBlueWork(hash) ?? 0n,
  }));

  return sortBlocks(sortable);
}
