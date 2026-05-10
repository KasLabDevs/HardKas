import { 
  createSimulatedDag, 
  addSimulatedBlock, 
  moveSink,
  resolveConflictsDeterministically
} from "@hardkas/localnet";

/**
 * Example 11: DAG Reorg Simulation
 * 
 * Demonstrates the lightweight blockDAG model for testing conflicts and reorgs.
 */
async function main() {
  console.log("=== HardKAS DAG Reorg Simulation ===");

  // 1. Initialize DAG
  let dag = createSimulatedDag();
  console.log(`Initial Sink: ${dag.sink}`);

  // 2. Add blocks on Branch A
  // Block A1: adds tx_A1
  dag = addSimulatedBlock(dag, {
    id: "block_A1",
    parents: ["genesis"],
    blueScore: "1",
    daaScore: "1",
    acceptedTxIds: ["tx_A1"]
  });

  // Block A2: adds tx_A2
  dag = addSimulatedBlock(dag, {
    id: "block_A2",
    parents: ["block_A1"],
    blueScore: "2",
    daaScore: "2",
    acceptedTxIds: ["tx_A2"]
  });

  // 3. Add blocks on Branch B (Fork from genesis)
  // Block B1: adds tx_B1 (conflicts with tx_A1)
  dag = addSimulatedBlock(dag, {
    id: "block_B1",
    parents: ["genesis"],
    blueScore: "1",
    daaScore: "1",
    acceptedTxIds: ["tx_B1"]
  });

  // 4. Define transactions (simplified outpoints for demonstration)
  const txs = {
    "tx_A1": { inputs: ["outpoint_X"] },
    "tx_A2": { inputs: ["outpoint_Y"] },
    "tx_B1": { inputs: ["outpoint_X"] } // Conflict with tx_A1
  };

  const txProvider = (txId: string) => txs[txId as keyof typeof txs];

  // 5. Move sink to Branch A
  console.log("\n--- Moving sink to Branch A (Block A2) ---");
  dag = moveSink(dag, "block_A2", txProvider);
  
  console.log(`Current Sink: ${dag.sink}`);
  console.log(`Accepted Txs: ${dag.acceptedTxIds.join(", ")}`);
  console.log(`Displaced Txs: ${dag.displacedTxIds.join(", ")}`);
  if (dag.conflictSet.length > 0) {
    console.log(`Conflicts: ${JSON.stringify(dag.conflictSet, null, 2)}`);
  }

  // 6. Move sink to Branch B (Reorg!)
  console.log("\n--- Simulating Reorg: Moving sink to Branch B (Block B1) ---");
  dag = moveSink(dag, "block_B1", txProvider);

  console.log(`Current Sink: ${dag.sink}`);
  console.log(`Accepted Txs: ${dag.acceptedTxIds.join(", ")}`);
  console.log(`Displaced Txs: ${dag.displacedTxIds.join(", ")}`);

  // 7. Merge A and B
  console.log("\n--- Merging A and B (Merging A2 and B1) ---");
  dag = addSimulatedBlock(dag, {
    id: "merge_block",
    parents: ["block_A2", "block_B1"],
    blueScore: "3",
    daaScore: "3",
    acceptedTxIds: ["tx_M1"]
  });
  
  txs["tx_M1" as keyof typeof txs] = { inputs: ["outpoint_Z"] };
  
  dag = moveSink(dag, "merge_block", txProvider);
  console.log(`Current Sink: ${dag.sink}`);
  console.log(`Selected Path: ${dag.selectedPathToSink.join(" -> ")}`);
  console.log(`Accepted Txs: ${dag.acceptedTxIds.join(", ")}`);
  console.log(`Displaced Txs: ${dag.displacedTxIds.join(", ")}`);
  
  console.log("\nNote: tx_B1 is displaced because tx_A1 was accepted first in deterministic block order (lexicographic tie-break between A1 and B1 if daaScore is same).");

  console.log("\n=== Simulation Finished ===");
}

main().catch(console.error);
