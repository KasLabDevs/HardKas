// SAFETY_LEVEL: RESEARCH_EXPERIMENTAL
//
// ApproxGhostdagEngine — structural approximation of GHOSTDAG.
// Translated from kaspa-sim/src/research/approx_ghostdag.rs
//
// ═══════════════════════════════════════════════════════════════════
// This is a structural approximation only.
// NO semantic equivalence with rusty-kaspa is claimed.
//
// Deviations:
//   1. Anticone check: pairwise BFS instead of selected-chain walk.
//   2. Reachability: BFS O(|past|) instead of interval tree O(1).
//   3. Blue_work: BigInt(2**128) / BigInt(bits+1) instead of U256 calc_work.
//   4. Blue_score: sp.blueScore + mergesetBlues.length (structurally plausible).
//   5. Merge ordering: correct sort key, approximate values.
// ═══════════════════════════════════════════════════════════════════

import type {
  BlockHash,
  BlueWorkType,
  GhostdagData,
  SimBlock,
} from "./ghostdag-types.js";
import { GENESIS_HASH, headerWork } from "./ghostdag-types.js";
import { findSelectedParent } from "./ordering.js";
import { GhostdagStore, genesisGhostdagData } from "./ghostdag-store.js";
import {
  isDagAncestorOf,
  orderedMergesetWithoutSelectedParent,
} from "./reachability.js";

/** The GHOSTDAG K parameter. Post-Crescendo mainnet (10 BPS): K = 18. */
export const DEFAULT_K = 18;

export type CandidateColor = "blue" | "red";

/**
 * Approximate GHOSTDAG engine.
 *
 * Computes GhostdagData for each block given its DAG context.
 * Uses BFS-based reachability and pairwise anticone checks.
 *
 * [RESEARCH_EXPERIMENTAL]: suitable for simulation, NOT for consensus equivalence.
 */
export class ApproxGhostdagEngine {
  readonly k: number;
  readonly genesisHash: BlockHash;

  constructor(k: number = DEFAULT_K, genesisHash: BlockHash = GENESIS_HASH) {
    this.k = k;
    this.genesisHash = genesisHash;
  }

  /**
   * Compute GhostdagData for `block`.
   *
   * Source: protocol.rs lines 126-166 ghostdag()
   *
   * Steps:
   *   1. findSelectedParent()
   *   2. orderedMergeset()
   *   3. color each candidate (check_blue_candidate)
   *   4. blueScore = sp.blueScore + |mergesetBlues|
   *   5. blueWork = sp.blueWork + Σ work(blues)
   *
   * All steps are [RESEARCH_EXPERIMENTAL].
   */
  computeGhostdag(
    block: SimBlock,
    allBlocks: ReadonlyMap<BlockHash, SimBlock>,
    gdStore: GhostdagStore
  ): GhostdagData {
    const hash = block.header.hash;

    // Genesis case.
    if (hash === this.genesisHash) {
      return genesisGhostdagData(this.genesisHash);
    }

    if (block.header.parents.length === 0) {
      throw new Error(
        `Non-genesis block ${hash.slice(0, 8)} has no parents — undefined in GHOSTDAG`
      );
    }

    // ── Step 1: selected_parent ──────────────────────────────────────────
    const parentBlueWorks = block.header.parents.map((p) => ({
      hash: p,
      blueWork: gdStore.getBlueWork(p) ?? 0n,
    }));

    const selectedParent = findSelectedParent(parentBlueWorks);
    if (selectedParent === undefined) {
      throw new Error(
        `findSelectedParent returned undefined for block ${hash.slice(0, 8)}`
      );
    }

    // ── Step 2: ordered mergeset ─────────────────────────────────────────
    const orderedMerge = orderedMergesetWithoutSelectedParent(
      block,
      selectedParent,
      allBlocks,
      gdStore
    );

    // ── Step 3: coloring ─────────────────────────────────────────────────
    const mergesetBlues: BlockHash[] = [selectedParent];
    const bluesAnticoneSizes: number[] = [0];
    const mergesetReds: BlockHash[] = [];

    for (const candidate of orderedMerge) {
      if (mergesetBlues.length > this.k) {
        mergesetReds.push(candidate.hash);
        continue;
      }

      const color = checkBlueCandidateApprox(
        candidate.hash,
        this.k,
        mergesetBlues,
        bluesAnticoneSizes,
        allBlocks
      );

      if (color === "blue") {
        mergesetBlues.push(candidate.hash);
      } else {
        mergesetReds.push(candidate.hash);
      }
    }

    // ── Step 4: blueScore ────────────────────────────────────────────────
    const spBlueScore = gdStore.getBlueScore(selectedParent) ?? 0;
    const blueScore = spBlueScore + mergesetBlues.length;

    // ── Step 5: blueWork ─────────────────────────────────────────────────
    const spBlueWork = gdStore.getBlueWork(selectedParent) ?? 0n;
    let addedBlueWork = 0n;
    for (const h of mergesetBlues) {
      const b = allBlocks.get(h);
      if (b) addedBlueWork += headerWork(b.header);
    }
    const blueWork = spBlueWork + addedBlueWork;

    return {
      blueScore,
      blueWork,
      selectedParent,
      mergesetBlues,
      mergesetReds,
      bluesAnticoneSizes,
    };
  }
}

/**
 * Blue-candidate check — pairwise BFS approximation.
 *
 * Source: protocol.rs lines 247-283 check_blue_candidate()
 *
 * [RESEARCH_EXPERIMENTAL]: uses isDagAncestorOf (BFS) instead of
 * ReachabilityService (interval tree). Structural approximation only.
 */
function checkBlueCandidateApprox(
  candidate: BlockHash,
  k: number,
  currentBlues: readonly BlockHash[],
  bluesAnticoneSizes: number[],
  allBlocks: ReadonlyMap<BlockHash, SimBlock>
): CandidateColor {
  let candidateAnticoneSize = 0;
  const toIncrement: number[] = [];

  for (let i = 0; i < currentBlues.length; i++) {
    const blue = currentBlues[i];

    const blueInPast = isDagAncestorOf(blue!, candidate, allBlocks);
    const candidateInPast = isDagAncestorOf(candidate, blue!, allBlocks);

    if (blueInPast || candidateInPast) {
      continue; // not in anticone of each other
    }

    // In anticone.
    candidateAnticoneSize++;
    if (candidateAnticoneSize > k) {
      return "red";
    }

    const existing = bluesAnticoneSizes[i] ?? 0;
    if (existing >= k) {
      return "red";
    }

    toIncrement.push(i);
  }

  // Candidate is blue — apply mutations.
  for (const idx of toIncrement) {
    bluesAnticoneSizes[idx]!++;
  }
  bluesAnticoneSizes.push(candidateAnticoneSize);

  return "blue";
}
