// SAFETY_LEVEL: RESEARCH_EXPERIMENTAL
//
// DAG-level aggregate metrics. HEURISTIC_ONLY — not protocol rules.

import type { BlockHash, SimBlock } from "./ghostdag-types.js";
import type { GhostdagStore } from "./ghostdag-store.js";
import { findSelectedParent } from "./ordering.js";

export interface DagMetrics {
  /** Total blocks in the DAG (excluding genesis). */
  totalBlocks: number;
  /** Number of blue blocks. */
  blueBlocks: number;
  /** Number of red blocks. */
  redBlocks: number;
  /** red / (blue + red). */
  redRatio: number;
  /** Average number of parents per block. */
  meanParents: number;
  /** Number of tip blocks (no children). */
  dagWidth: number;
  /** Highest blueScore in the DAG. */
  maxBlueScore: number;
  /** Highest blueWork in the DAG. */
  maxBlueWork: bigint;
  /** Length of the selected parent chain from sink to genesis. */
  selectedChainLength: number;
  /** Block IDs on the selected chain. */
  selectedChain: string[];
}

export function computeDagMetrics(
  allBlocks: Map<BlockHash, SimBlock>,
  gdStore: GhostdagStore,
  genesisHash: BlockHash
): DagMetrics {
  const totalBlocks = allBlocks.size - 1; // excluding genesis
  
  // Tips are blocks that are not parents of any other block
  const parentIds = new Set<BlockHash>();
  let totalParentLinks = 0;
  for (const block of allBlocks.values()) {
    for (const p of block.header.parents) {
      parentIds.add(p);
    }
    if (!block.header.parents.includes(genesisHash) && block.header.hash !== genesisHash) {
        // Just for mean parents calculation
    }
    totalParentLinks += block.header.parents.length;
  }
  
  const tips = Array.from(allBlocks.keys()).filter(id => !parentIds.has(id));
  const dagWidth = tips.length;
  const meanParents = totalBlocks > 0 ? totalParentLinks / (totalBlocks + 1) : 0;

  // Sink is the best tip
  const tipData = tips.map(id => ({
    hash: id,
    blueWork: gdStore.getBlueWork(id) ?? 0n
  }));
  
  const sink = findSelectedParent(tipData) || genesisHash;
  
  // Selected chain walk
  const selectedChain: string[] = [];
  let currentId: BlockHash | undefined = sink;
  while (currentId) {
    selectedChain.unshift(currentId);
    if (currentId === genesisHash) break;
    currentId = gdStore.getSelectedParent(currentId);
  }

  // Coloring: a block is blue if it's blue in the mergeset of some block on the selected chain
  // or if it's on the selected chain itself.
  // HEURISTIC: In a stable DAG, blue blocks are those that are NOT red in the sink's view.
  // Actually, let's use the sink's GhostdagData if available to count blues/reds in the whole past.
  // Wait, GHOSTDAG coloring is relative to a block. We usually mean "blue in the sink's past".
  
  let blueBlocks = 0;
  let redBlocks = 0;
  let maxBlueScore = 0;
  let maxBlueWork = 0n;

  // We'll traverse all blocks and check their status relative to the sink's view
  // But wait, computeGhostdag already defines blueScore and blueWork for each block.
  // blueScore(sink) is the number of blue blocks in past(sink).
  
  const sinkData = gdStore.getData(sink);
  if (sinkData) {
    blueBlocks = sinkData.blueScore; // includes genesis? usually yes in this impl
    // Total reachable blocks in past(sink) excluding genesis
    // For simplicity, we'll just use the store values
  }

  for (const id of allBlocks.keys()) {
    if (id === genesisHash) continue;
    const score = gdStore.getBlueScore(id) || 0;
    const work = gdStore.getBlueWork(id) || 0n;
    if (score > maxBlueScore) maxBlueScore = score;
    if (work > maxBlueWork) maxBlueWork = work;
  }

  // To count total red blocks in the DAG, we need to know all blocks in past(sink)
  // and which ones are not blue.
  // Since we are building these DAGs in scenarios, we can just look at the final sink.
  
  if (sinkData) {
      // In this simulator, blueScore is total blues in past.
      // We need to count total blocks in past(sink).
      const past = identifyReachableBlocks(allBlocks, sink);
      const totalInPast = past.size - 1; // excluding genesis
      blueBlocks = sinkData.blueScore; 
      // If genesis is blueScore 0, then blueBlocks is count of non-genesis blues.
      redBlocks = Math.max(0, totalInPast - blueBlocks);
  }

  return {
    totalBlocks,
    blueBlocks,
    redBlocks,
    redRatio: (blueBlocks + redBlocks) > 0 ? redBlocks / (blueBlocks + redBlocks) : 0,
    meanParents,
    dagWidth,
    maxBlueScore,
    maxBlueWork,
    selectedChainLength: selectedChain.length,
    selectedChain
  };
}

function identifyReachableBlocks(allBlocks: Map<BlockHash, SimBlock>, sinkId: BlockHash): Set<BlockHash> {
  const reachable = new Set<BlockHash>();
  const stack = [sinkId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const block = allBlocks.get(id);
    if (block) {
      for (const p of block.header.parents) {
        stack.push(p);
      }
    }
  }
  return reachable;
}
