import { 
  loadOrCreateLocalnetState, 
  saveLocalnetState,
  createSimulatedDag,
  moveSink
} from "@hardkas/localnet";
import { UI } from "../ui.js";

/**
 * Runner for 'hardkas dag status'
 */
export async function runDagStatus() {
  const state = await loadOrCreateLocalnetState();
  
  if (!state.dag) {
    UI.info("DAG simulation is not initialized in this localnet.");
    UI.info("Hint: Use 'hardkas dag status' again after DAG operations or manual init.");
    // Auto-init for status check if missing? 
    // Usually P1.4 logic would be triggered by specific commands.
    return;
  }

  UI.header("DAG Status (Light-Model)");
  UI.field("Mode", state.dag.blocks["genesis"] ? "dag-light" : "linear");
  UI.field("Sink", state.dag.sink);
  UI.field("Blocks", Object.keys(state.dag.blocks).length);
  UI.field("Selected Path", state.dag.selectedPathToSink.join(" -> "));
  
  UI.info(`\nAccepted Transactions (${state.dag.acceptedTxIds.length}):`);
  if (state.dag.acceptedTxIds.length > 0) {
    state.dag.acceptedTxIds.forEach(id => console.log(`  - ${id}`));
  } else {
    UI.info("  None");
  }

  UI.info(`\nDisplaced Transactions (${state.dag.displacedTxIds.length}):`);
  if (state.dag.displacedTxIds.length > 0) {
    state.dag.displacedTxIds.forEach(id => console.log(`  - ${id}`));
  } else {
    UI.info("  None");
  }
}

/**
 * Runner for 'hardkas dag simulate-reorg --depth <n>'
 */
export async function runDagSimulateReorg(options: { depth: number }) {
  const state = await loadOrCreateLocalnetState();
  
  if (!state.dag) {
    UI.info("Initializing DAG light-model for this localnet...");
    state.dag = createSimulatedDag();
  }

  UI.info(`Simulating reorg at depth ${options.depth}...`);
  
  // Minimal v0.2-alpha implementation: 
  // 1. Create a side-branch starting 'depth' blocks back.
  // 2. Move sink to that side-branch.
  
  const currentPath = state.dag.selectedPathToSink;
  const forkPointIndex = Math.max(0, currentPath.length - 1 - options.depth);
  const forkPointId = currentPath[forkPointIndex];
  if (!forkPointId) throw new Error("Could not find fork point in current path.");
  
  const forkPoint = state.dag.blocks[forkPointId];
  if (!forkPoint) throw new Error(`Fork point block ${forkPointId} not found in state.`);

  const sideBlockId = `reorg_side_${Date.now().toString(36)}`;
  state.dag.blocks[sideBlockId] = {
    id: sideBlockId,
    parents: [forkPointId],
    blueScore: (BigInt(forkPoint.blueScore || "0") + 1n).toString(),
    daaScore: (BigInt(forkPoint.daaScore || "0") + 1n).toString(),
    acceptedTxIds: []
  };

  // Re-calculate state by moving sink to the new side-block
  // For simplicity in CLI, we use a placeholder tx provider
  const txProvider = (_id: string) => undefined; 
  
  state.dag = moveSink(state.dag, sideBlockId, txProvider);
  
  await saveLocalnetState(state);
  
  UI.success("Reorg simulation complete.");
  UI.info(`New Sink: ${state.dag.sink}`);
  UI.info(`Selected Path: ${state.dag.selectedPathToSink.join(" -> ")}`);
}
