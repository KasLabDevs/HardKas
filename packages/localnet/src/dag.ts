import { SimulatedBlock, SimulatedDag } from "./types.js";

/**
 * Creates a fresh simulated DAG with a genesis block.
 */
export function createSimulatedDag(): SimulatedDag {
  const genesis: SimulatedBlock = {
    id: "genesis",
    parents: [],
    blueScore: "0",
    daaScore: "0",
    acceptedTxIds: [],
    isGenesis: true
  };

  return {
    blocks: { [genesis.id]: genesis },
    sink: genesis.id,
    selectedPathToSink: [genesis.id],
    acceptedTxIds: [],
    displacedTxIds: [],
    conflictSet: []
  };
}

/**
 * Adds a block to the DAG.
 */
export function addSimulatedBlock(
  dag: SimulatedDag,
  block: SimulatedBlock
): SimulatedDag {
  const newBlocks = { ...dag.blocks, [block.id]: block };
  return {
    ...dag,
    blocks: newBlocks
  };
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
  // Rules:
  // - Blue score (daaScore approximation)
  // - Tie-break by block ID lexicographically
  const sortedBlocks = reachableBlocks.sort((a, b) => {
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
  const path: SimulatedBlock[] = [];
  let currentId: string | undefined = sinkId;
  while (currentId) {
    const current: SimulatedBlock | undefined = dag.blocks[currentId];
    if (!current) break;
    path.unshift(current);
    if (current.parents.length === 0) break;
    currentId = current.parents[0];
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

    // 2. Deterministic block order
    const daaA = BigInt(blockA.daaScore);
    const daaB = BigInt(blockB.daaScore);
    if (daaA !== daaB) return daaA < daaB ? -1 : 1;
    if (a.blockId !== b.blockId) return a.blockId.localeCompare(b.blockId);

    // 3. TxId lexicographic tie-break
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
