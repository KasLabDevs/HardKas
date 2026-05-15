import { SimulatedBlock, SimulatedDag } from "./types.js";
import {
  ApproxGhostdagEngine,
  GhostdagStore,
  genesisGhostdagData,
  findSelectedParent,
  GENESIS_HASH as SIM_GENESIS_HASH,
} from "@hardkas/simulator";
import type { SimBlock as GhostdagSimBlock, BlockHash } from "@hardkas/simulator";

// Per-DAG state containers (WeakMap-keyed by DAG reference)
const dagIdMaps = new WeakMap<SimulatedDag, Map<string, BlockHash>>();
const dagReverseIdMaps = new WeakMap<SimulatedDag, Map<BlockHash, string>>();

function getIdMap(dag: SimulatedDag): Map<string, BlockHash> {
  let m = dagIdMaps.get(dag);
  if (!m) {
    m = new Map<string, BlockHash>();
    m.set("genesis", SIM_GENESIS_HASH);
    dagIdMaps.set(dag, m);
  }
  return m;
}

function getReverseIdMap(dag: SimulatedDag): Map<BlockHash, string> {
  let m = dagReverseIdMaps.get(dag);
  if (!m) {
    m = new Map<BlockHash, string>();
    m.set(SIM_GENESIS_HASH, "genesis");
    dagReverseIdMaps.set(dag, m);
  }
  return m;
}

/**
 * Helper to convert SimulatedBlock to GhostdagSimBlock
 */
function toGhostdagSimBlock(block: SimulatedBlock, idMap: Map<string, BlockHash>): GhostdagSimBlock {
  const hash = idMap.get(block.id) || block.id;
  const parents = block.parents.map(p => idMap.get(p) || p);
  
  return {
    header: {
      hash,
      parents,
      timestampUs: 0,
      minerId: 0,
      bits: 1000, // Default difficulty for simulation
      nonce: 0,
    }
  };
}


/**
 * Creates a fresh simulated DAG with a genesis block.
 */
export function createSimulatedDag(options?: { k?: number }): SimulatedDag {
  const k = options?.k ?? 18;
  const engine = new ApproxGhostdagEngine(k);

  const genesis: SimulatedBlock = {
    id: "genesis",
    parents: [],
    blueScore: "0",
    daaScore: "0",
    acceptedTxIds: [],
    isGenesis: true
  };
  
  const gdStore = new GhostdagStore();
  gdStore.insert(SIM_GENESIS_HASH, genesisGhostdagData(SIM_GENESIS_HASH));

  const dag: SimulatedDag = {
    blocks: { [genesis.id]: genesis },
    sink: genesis.id,
    selectedPathToSink: [genesis.id],
    acceptedTxIds: [],
    displacedTxIds: [],
    conflictSet: [],
    ghostdagStore: gdStore,
    ghostdagEngine: engine
  };

  // Initialize per-DAG id maps
  const idMap = new Map<string, BlockHash>();
  idMap.set("genesis", SIM_GENESIS_HASH);
  dagIdMaps.set(dag, idMap);

  const reverseIdMap = new Map<BlockHash, string>();
  reverseIdMap.set(SIM_GENESIS_HASH, "genesis");
  dagReverseIdMaps.set(dag, reverseIdMap);

  return dag;
}

/**
 * Adds a block to the DAG.
 */
export function addSimulatedBlock(
  dag: SimulatedDag,
  block: SimulatedBlock
): SimulatedDag {
  const idMap = getIdMap(dag);
  const reverseIdMap = getReverseIdMap(dag);

  // 1. Compute GHOSTDAG data
  const gdBlock = toGhostdagSimBlock(block, idMap);
  
  // Create a map of all blocks in simulator format for the engine
  const allGdBlocks = new Map<BlockHash, GhostdagSimBlock>();
  for (const b of Object.values(dag.blocks)) {
    allGdBlocks.set(idMap.get(b.id) || b.id, toGhostdagSimBlock(b, idMap));
  }
  allGdBlocks.set(gdBlock.header.hash, gdBlock);

  const gdStore = dag.ghostdagStore || new GhostdagStore();
  const dagEngine = dag.ghostdagEngine || new ApproxGhostdagEngine();
  const gdData = dagEngine.computeGhostdag(gdBlock, allGdBlocks, gdStore);
  gdStore.insert(gdBlock.header.hash, gdData);

  // 2. Update block with GHOSTDAG fields
  const updatedBlock: SimulatedBlock = {
    ...block,
    ghostdagData: gdData,
    blueWork: gdData.blueWork.toString(),
    isBlue: true // The block itself is the new tip on its own path
  };
  
  if (!idMap.has(block.id)) {
    idMap.set(block.id, block.id);
    reverseIdMap.set(block.id, block.id);
  }

  const newBlocks = { ...dag.blocks, [updatedBlock.id]: updatedBlock };
  
  // 3. Update isBlue status for blocks in the mergeset of the new block
  for (const blueHash of gdData.mergesetBlues) {
    const id = reverseIdMap.get(blueHash) || blueHash;
    if (newBlocks[id]) {
      newBlocks[id] = { ...newBlocks[id], isBlue: true };
    }
  }
  for (const redHash of gdData.mergesetReds) {
    const id = reverseIdMap.get(redHash) || redHash;
    if (newBlocks[id]) {
      newBlocks[id] = { ...newBlocks[id], isBlue: false };
    }
  }

  // Propagate id maps to new DAG reference
  const newDag: SimulatedDag = {
    ...dag,
    blocks: newBlocks
  };
  dagIdMaps.set(newDag, idMap);
  dagReverseIdMaps.set(newDag, reverseIdMap);

  return newDag;
}

/**
 * Moves the sink and recomputes the accepted transaction set.
 */
export function moveSink(
  dag: SimulatedDag,
  newSinkId: string,
  txProvider: (txId: string) => { inputs: string[] } | undefined
): SimulatedDag {
  if (!dag.blocks[newSinkId]) {
    throw new Error(`Block ${newSinkId} not found in DAG.`);
  }

  // 1. Calculate selected path to sink (sink ancestry)
  const selectedPath = calculateSelectedPath(dag, newSinkId);

  // 2. Identify all reachable blocks from sink
  const reachableBlocks = identifyReachableBlocks(dag, newSinkId);

  // 3. Sort reachable blocks deterministically
  // GHOSTDAG Priority:
  // - blueWork (descending for sorting? No, topological order usually wants ascending)
  // - isBlue (blue blocks before red blocks in mergeset? Step 3 says "transactions in blue blocks have priority")
  // - Tie-break by block ID
  
  const sortedBlocks = reachableBlocks.sort((a, b) => {
    // If both have GHOSTDAG data, use it
    if (a.ghostdagData && b.ghostdagData) {
      const workA = BigInt(a.blueWork || "0");
      const workB = BigInt(b.blueWork || "0");
      if (workA !== workB) return workA < workB ? -1 : 1;
      
      // If work is same, blue blocks first (but work includes this block's work usually)
      if (a.isBlue !== b.isBlue) return a.isBlue ? -1 : 1;
    }
    
    // Fallback to legacy
    const daaA = BigInt(a.daaScore);
    const daaB = BigInt(b.daaScore);
    if (daaA !== daaB) return daaA < daaB ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  // 4. Resolve conflicts and build accepted set
  // Process all txs in topological/deterministic block order
  const acceptedTxIds: string[] = [];
  const displacedTxIds: string[] = [];
  const conflictSet: Array<{ outpoint: string; winnerTxId: string; loserTxIds: string[] }> = [];
  const spentOutpoints = new Map<string, string>(); // outpoint -> txId

  for (const block of sortedBlocks) {
    for (const txId of block.acceptedTxIds) {
      const tx = txProvider(txId);
      if (!tx) {
        // If tx not found, skip (shouldn't happen in a consistent simulation)
        continue;
      }

      let conflictFound = false;
      for (const input of tx.inputs) {
        if (spentOutpoints.has(input)) {
          const winnerTxId = spentOutpoints.get(input)!;
          let entry = conflictSet.find(c => c.outpoint === input);
          if (!entry) {
            entry = { outpoint: input, winnerTxId, loserTxIds: [] };
            conflictSet.push(entry);
          }
          entry.loserTxIds.push(txId);
          conflictFound = true;
          break;
        }
      }

      if (conflictFound) {
        displacedTxIds.push(txId);
      } else {
        // No conflict, accept and mark outpoints as spent
        acceptedTxIds.push(txId);
        for (const input of tx.inputs) {
          spentOutpoints.set(input, txId);
        }
      }
    }
  }

  // 5. Track newly displaced transactions (previously accepted but no longer reachable or now conflicted)
  const newlyDisplaced = dag.acceptedTxIds.filter(id => !acceptedTxIds.includes(id));
  for (const id of newlyDisplaced) {
    if (!displacedTxIds.includes(id)) {
      displacedTxIds.push(id);
    }

    // Check for explicit conflicts to populate conflictSet
    const tx = txProvider(id);
    if (tx) {
      for (const input of tx.inputs) {
        if (spentOutpoints.has(input)) {
          const winnerTxId = spentOutpoints.get(input)!;
          let entry = conflictSet.find(c => c.outpoint === input);
          if (!entry) {
            entry = { outpoint: input, winnerTxId, loserTxIds: [] };
            conflictSet.push(entry);
          }
          if (!entry.loserTxIds.includes(id)) {
            entry.loserTxIds.push(id);
          }
          break;
        }
      }
    }
  }

  return {
    ...dag,
    sink: newSinkId,
    selectedPathToSink: selectedPath.map(b => b.id),
    acceptedTxIds,
    displacedTxIds,
    conflictSet
  };
}

function calculateSelectedPath(dag: SimulatedDag, sinkId: string): SimulatedBlock[] {
  const reverseIdMap = getReverseIdMap(dag);
  const path: SimulatedBlock[] = [];
  let currentId: string | undefined = sinkId;
  while (currentId) {
    const current: SimulatedBlock | undefined = dag.blocks[currentId];
    if (!current) break;
    path.unshift(current);
    if (current.isGenesis) break;
    
    // GHOSTDAG walk
    if (current.ghostdagData) {
      const spHash: string = current.ghostdagData.selectedParent;
      currentId = reverseIdMap.get(spHash) || spHash;
    } else {
      // Legacy walk
      if (current.parents.length === 0) break;
      currentId = current.parents[0];
    }
  }
  return path;
}

function identifyReachableBlocks(dag: SimulatedDag, sinkId: string): SimulatedBlock[] {
  const reachable = new Set<string>();
  const stack = [sinkId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const block = dag.blocks[id];
    if (block) {
      for (const p of block.parents) {
        stack.push(p);
      }
    }
  }
  return Array.from(reachable)
    .map(id => dag.blocks[id])
    .filter((b): b is SimulatedBlock => b !== undefined);
}

/**
 * Deterministic Conflict Resolution (Approximation for v0.2-alpha)
 * Priority:
 * 1. sink ancestry priority (is part of selectedPathToSink?)
 * 2. deterministic block order (daaScore then block ID)
 * 3. txId lexicographic tie-break
 */
export function resolveConflictsDeterministically(
  txs: Array<{ txId: string; blockId: string; inputs: string[] }>,
  dag: SimulatedDag
): { accepted: string[]; displaced: string[]; conflicts: any[] } {
  // Sort transactions by rules
  const sortedTxs = txs.sort((a, b) => {
    const blockA = dag.blocks[a.blockId];
    const blockB = dag.blocks[b.blockId];

    if (!blockA || !blockB) {
      if (!blockA && !blockB) return a.txId.localeCompare(b.txId);
      return !blockA ? 1 : -1;
    }

    // 1. Sink ancestry priority
    const inPathA = dag.selectedPathToSink.includes(a.blockId);
    const inPathB = dag.selectedPathToSink.includes(b.blockId);
    if (inPathA !== inPathB) return inPathA ? -1 : 1;

    // 2. GHOSTDAG ordering
    if (blockA.ghostdagData && blockB.ghostdagData) {
      // Blue blocks priority
      if (blockA.isBlue !== blockB.isBlue) return blockA.isBlue ? -1 : 1;
      
      // Ascending blueWork within the same color/category
      const workA = BigInt(blockA.blueWork || "0");
      const workB = BigInt(blockB.blueWork || "0");
      if (workA !== workB) return workA < workB ? -1 : 1;
    }

    // 3. Legacy Deterministic block order
    const daaA = BigInt(blockA.daaScore);
    const daaB = BigInt(blockB.daaScore);
    if (daaA !== daaB) return daaA < daaB ? -1 : 1;
    if (a.blockId !== b.blockId) return a.blockId.localeCompare(b.blockId);

    // 4. TxId lexicographic tie-break
    return a.txId.localeCompare(b.txId);
  });

  const accepted: string[] = [];
  const displaced: string[] = [];
  const conflicts: any[] = [];
  const spent = new Map<string, string>();

  for (const tx of sortedTxs) {
    let conflictFound = false;
    for (const input of tx.inputs) {
      if (spent.has(input)) {
        const winner = spent.get(input)!;
        let c = conflicts.find(x => x.outpoint === input);
        if (!c) {
          c = { outpoint: input, winnerTxId: winner, loserTxIds: [] };
          conflicts.push(c);
        }
        c.loserTxIds.push(tx.txId);
        conflictFound = true;
        break;
      }
    }

    if (conflictFound) {
      displaced.push(tx.txId);
    } else {
      accepted.push(tx.txId);
      for (const input of tx.inputs) {
        spent.set(input, tx.txId);
      }
    }
  }

  return { accepted, displaced, conflicts };
}

/**
 * Get the blue/red coloring of all blocks in the DAG.
 * Returns a map of blockId → { isBlue, blueWork, blueScore }.
 */
export function getDagColoring(dag: SimulatedDag): Map<string, { isBlue: boolean; blueWork: string; blueScore: number }> {
  const coloring = new Map<string, { isBlue: boolean; blueWork: string; blueScore: number }>();
  for (const [id, block] of Object.entries(dag.blocks)) {
    coloring.set(id, {
      isBlue: block.isBlue || false,
      blueWork: block.blueWork || "0",
      blueScore: block.ghostdagData?.blueScore || Number(block.blueScore) || 0
    });
  }
  return coloring;
}

/**
 * Get the selected parent chain from sink to genesis.
 */
export function getSelectedChain(dag: SimulatedDag): string[] {
  return calculateSelectedPath(dag, dag.sink).map(b => b.id);
}

/**
 * Helper to find the best tip block according to GHOSTDAG.
 */
export function findBestTip(dag: SimulatedDag): string {
  const idMap = getIdMap(dag);
  const allBlockIds = Object.keys(dag.blocks);
  if (allBlockIds.length === 0) return "genesis";
  
  // A tip is a block that is not a parent of any other block
  const parentIds = new Set<string>();
  for (const block of Object.values(dag.blocks)) {
    for (const p of block.parents) {
      parentIds.add(p);
    }
  }
  
  const tips = allBlockIds.filter(id => !parentIds.has(id));
  if (tips.length === 0) return dag.sink;

  const tipData = tips.map(id => ({
    hash: idMap.get(id) || id,
    blueWork: BigInt(dag.blocks[id]!.blueWork || "0")
  }));

  const bestTipHash = findSelectedParent(tipData);
  // Reverse map or just find the tip with matching hash/id
  const bestTip = tips.find(id => (idMap.get(id) || id) === bestTipHash);
  
  return bestTip || tips[0]!;
}

