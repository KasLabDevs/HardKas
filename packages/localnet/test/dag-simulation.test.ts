import { describe, it, expect } from "vitest";
import { createSimulatedDag, addSimulatedBlock, moveSink } from "../src/dag.js";

describe("DAG Simulation", () => {
  it("should resolve conflicts deterministically by ancestry", () => {
    let dag = createSimulatedDag();
    
    // Add two competing blocks spending the same output
    // Block A (priority 1)
    const blockA = {
      id: "blockA",
      parents: ["genesis"],
      blueScore: "1",
      daaScore: "1",
      acceptedTxIds: ["tx1"],
      isGenesis: false
    };
    
    // Block B (competing)
    const blockB = {
      id: "blockB",
      parents: ["genesis"],
      blueScore: "1",
      daaScore: "1",
      acceptedTxIds: ["tx2"],
      isGenesis: false
    };

    dag = addSimulatedBlock(dag, blockA);
    dag = addSimulatedBlock(dag, blockB);

    // txProvider that simulates tx1 and tx2 spending the same input
    const txProvider = (id: string) => {
      if (id === "tx1") return { inputs: ["out1"] };
      if (id === "tx2") return { inputs: ["out1"] };
      return undefined;
    };

    // 1. Initial move to genesis (empty)
    dag = moveSink(dag, "genesis", txProvider);

    // 2. Move sink to Block B -> tx2 accepted
    dag = moveSink(dag, "blockB", txProvider);
    expect(dag.acceptedTxIds).toContain("tx2");
    expect(dag.acceptedTxIds).not.toContain("tx1");

    // 3. Move sink to Block A -> tx2 displaced, tx1 accepted
    dag = moveSink(dag, "blockA", txProvider);
    expect(dag.acceptedTxIds).toContain("tx1");
    expect(dag.displacedTxIds).toContain("tx2");
    expect(dag.conflictSet).toHaveLength(1);
    expect(dag.conflictSet[0]!.winnerTxId).toBe("tx1");

    // 4. Move sink back to Block B -> tx1 displaced, tx2 accepted
    dag = moveSink(dag, "blockB", txProvider);
    expect(dag.acceptedTxIds).toContain("tx2");
    expect(dag.displacedTxIds).toContain("tx1");
    expect(dag.conflictSet[0]!.winnerTxId).toBe("tx2");
  });

  it("should handle complex displacement when sink moves to a side-branch", () => {
    // genesis -> A -> C (sink)
    //         -> B
    
    let dag = createSimulatedDag();
    dag = addSimulatedBlock(dag, { id: "A", parents: ["genesis"], daaScore: "1", blueScore: "1", acceptedTxIds: ["txA"], isGenesis: false });
    dag = addSimulatedBlock(dag, { id: "B", parents: ["genesis"], daaScore: "1", blueScore: "1", acceptedTxIds: ["txB"], isGenesis: false });
    dag = addSimulatedBlock(dag, { id: "C", parents: ["A"], daaScore: "2", blueScore: "2", acceptedTxIds: ["txC"], isGenesis: false });

    const txProvider = (id: string) => {
      if (id === "txA") return { inputs: ["in1"] };
      if (id === "txB") return { inputs: ["in1"] }; // Conflict with A
      if (id === "txC") return { inputs: ["in2"] };
      return undefined;
    };

    // 1. Move to B first
    dag = moveSink(dag, "B", txProvider);
    expect(dag.acceptedTxIds).toContain("txB");

    // 2. Move to C (which has A as parent)
    dag = moveSink(dag, "C", txProvider);
    expect(dag.acceptedTxIds).toContain("txA");
    expect(dag.acceptedTxIds).toContain("txC");
    expect(dag.displacedTxIds).toContain("txB");
    expect(dag.selectedPathToSink).toEqual(["genesis", "A", "C"]);
  });
});
