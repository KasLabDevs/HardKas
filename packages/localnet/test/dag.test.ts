import { describe, it, expect } from "vitest";
import { 
  createSimulatedDag, 
  addSimulatedBlock, 
  moveSink,
  resolveConflictsDeterministically
} from "../src/dag.js";

describe("DAG Simulation Light-Model", () => {
  it("should create a DAG with genesis", () => {
    const dag = createSimulatedDag();
    expect(dag.sink).toBe("genesis");
    expect(dag.blocks["genesis"]).toBeDefined();
    expect(dag.selectedPathToSink).toEqual(["genesis"]);
  });

  it("should resolve conflicts deterministically (Priority: Ancestry > Order > ID)", () => {
    let dag = createSimulatedDag();
    
    // Create two branches
    dag = addSimulatedBlock(dag, {
      id: "block_A",
      parents: ["genesis"],
      blueScore: "1",
      daaScore: "1",
      acceptedTxIds: ["tx_A"]
    });

    dag = addSimulatedBlock(dag, {
      id: "block_B",
      parents: ["genesis"],
      blueScore: "1",
      daaScore: "1",
      acceptedTxIds: ["tx_B"]
    });

    // Move sink to A
    dag = moveSink(dag, "block_A", (id) => ({ inputs: ["X"] }));

    const txs = [
      { txId: "tx_A", blockId: "block_A", inputs: ["X"] },
      { txId: "tx_B", blockId: "block_B", inputs: ["X"] }
    ];

    const result = resolveConflictsDeterministically(txs, dag);
    
    // block_A is in sink ancestry, so tx_A wins
    expect(result.accepted).toContain("tx_A");
    expect(result.displaced).toContain("tx_B");
    expect(result.conflicts[0].winnerTxId).toBe("tx_A");
  });

  it("should resolve conflicts by tie-break if neither in ancestry path", () => {
    let dag = createSimulatedDag();
    
    dag = addSimulatedBlock(dag, {
      id: "block_A",
      parents: ["genesis"],
      blueScore: "1",
      daaScore: "1",
      acceptedTxIds: ["tx_A"]
    });

    dag = addSimulatedBlock(dag, {
      id: "block_B",
      parents: ["genesis"],
      blueScore: "1",
      daaScore: "1",
      acceptedTxIds: ["tx_B"]
    });

    // Sink stays at genesis
    dag = moveSink(dag, "genesis", (id) => ({ inputs: ["X"] }));

    const txs = [
      { txId: "tx_A", blockId: "block_A", inputs: ["X"] },
      { txId: "tx_B", blockId: "block_B", inputs: ["X"] }
    ];

    const result = resolveConflictsDeterministically(txs, dag);
    
    // Tie-break by block ID: block_A < block_B lexicographically
    expect(result.accepted).toContain("tx_A");
    expect(result.displaced).toContain("tx_B");
  });

  it("should handle reorg by changing sink ancestry", () => {
    let dag = createSimulatedDag();
    
    // A-branch
    dag = addSimulatedBlock(dag, { id: "A1", parents: ["genesis"], blueScore: "1", daaScore: "1", acceptedTxIds: ["tx1"] });
    
    // B-branch (longer)
    dag = addSimulatedBlock(dag, { id: "B1", parents: ["genesis"], blueScore: "1", daaScore: "1", acceptedTxIds: ["tx1"] });
    dag = addSimulatedBlock(dag, { id: "B2", parents: ["B1"], blueScore: "2", daaScore: "2", acceptedTxIds: ["tx2"] });

    const txProvider = (id: string) => ({ inputs: id === "tx1" ? ["X"] : ["Y"] });

    // Move to A1
    dag = moveSink(dag, "A1", txProvider);
    expect(dag.acceptedTxIds).toContain("tx1");

    // Reorg to B2
    dag = moveSink(dag, "B2", txProvider);
    expect(dag.selectedPathToSink).toEqual(["genesis", "B1", "B2"]);
    expect(dag.acceptedTxIds).toContain("tx1");
    expect(dag.acceptedTxIds).toContain("tx2");
  });
});
