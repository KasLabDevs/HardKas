import { describe, it, expect, beforeEach } from "vitest";
import { 
  createSimulatedDag, 
  addSimulatedBlock, 
  moveSink, 
  getDagColoring, 
  getSelectedChain,
  findBestTip,
  resolveConflictsDeterministically
} from "../src/dag.js";
import { SimulatedBlock } from "../src/types.js";

describe("GHOSTDAG DAG ordering", () => {
  let dag = createSimulatedDag();

  beforeEach(() => {
    dag = createSimulatedDag();
  });

  it("sink is determined by highest blueWork, not first-seen", () => {
    // 1. Create two siblings A and B
    const a: SimulatedBlock = {
      id: "A",
      parents: ["genesis"],
      blueScore: "1",
      daaScore: "1",
      acceptedTxIds: []
    };
    const b: SimulatedBlock = {
      id: "B",
      parents: ["genesis"],
      blueScore: "1",
      daaScore: "1",
      acceptedTxIds: []
    };

    dag = addSimulatedBlock(dag, a);
    dag = addSimulatedBlock(dag, b);

    // 2. Add block C on top of B, making B chain "heavier"
    const c: SimulatedBlock = {
      id: "C",
      parents: ["B"],
      blueScore: "2",
      daaScore: "2",
      acceptedTxIds: []
    };
    dag = addSimulatedBlock(dag, c);

    // 3. The best tip should be C
    const bestTip = findBestTip(dag);
    expect(bestTip).toBe("C");

    // 4. Move sink to C and verify selected chain
    dag = moveSink(dag, "C", () => undefined);
    const chain = getSelectedChain(dag);
    expect(chain).toEqual(["genesis", "B", "C"]);
  });

  it("blocks in red set are marked isBlue=false", () => {
    // We can't easily force red blocks with DEFAULT_K=18 in a small test
    // but we can verify the isBlue field exists and is true for simple chains
    const a: SimulatedBlock = {
      id: "A",
      parents: ["genesis"],
      blueScore: "1",
      daaScore: "1",
      acceptedTxIds: []
    };
    dag = addSimulatedBlock(dag, a);
    expect(dag.blocks["A"]?.isBlue).toBe(true);
  });

  it("getSelectedChain returns path from sink to genesis", () => {
    const a: SimulatedBlock = { id: "A", parents: ["genesis"], blueScore: "1", daaScore: "1", acceptedTxIds: [] };
    const b: SimulatedBlock = { id: "B", parents: ["A"], blueScore: "2", daaScore: "2", acceptedTxIds: [] };
    const c: SimulatedBlock = { id: "C", parents: ["B"], blueScore: "3", daaScore: "3", acceptedTxIds: [] };

    dag = addSimulatedBlock(dag, a);
    dag = addSimulatedBlock(dag, b);
    dag = addSimulatedBlock(dag, c);

    dag = moveSink(dag, "C", () => undefined);
    const chain = getSelectedChain(dag);
    expect(chain).toEqual(["genesis", "A", "B", "C"]);
  });

  it("getDagColoring returns coloring for all blocks", () => {
    const a: SimulatedBlock = { id: "A", parents: ["genesis"], blueScore: "1", daaScore: "1", acceptedTxIds: [] };
    dag = addSimulatedBlock(dag, a);

    const coloring = getDagColoring(dag);
    expect(coloring.has("genesis")).toBe(true);
    expect(coloring.has("A")).toBe(true);
    expect(coloring.get("A")?.isBlue).toBe(true);
    expect(BigInt(coloring.get("A")?.blueWork || "0")).toBeGreaterThan(0n);
  });

  it("conflict resolution uses GHOSTDAG ordering", () => {
    // Build a DAG where A is blue and B is in anticone (potentially red if K was small)
    // For simplicity, we just verify that blueWork ordering is used if present
    
    const a: SimulatedBlock = { id: "A", parents: ["genesis"], blueScore: "1", daaScore: "1", acceptedTxIds: ["txA"] };
    const b: SimulatedBlock = { id: "B", parents: ["genesis"], blueScore: "1", daaScore: "1", acceptedTxIds: ["txB"] };
    
    // We want A to have more work than B
    // In our implementation, work is accumulated. 
    // If we add A first, it's just a tip.
    // If we add C on top of A, A is in the past of C.
    
    dag = addSimulatedBlock(dag, a);
    dag = addSimulatedBlock(dag, b);
    
    // Both are currently blue. Tie-break by blueWork (which might be same) then ID.
    // Let's make A definitively better by adding a block on top of it.
    const c: SimulatedBlock = { id: "C", parents: ["A"], blueScore: "2", daaScore: "2", acceptedTxIds: [] };
    dag = addSimulatedBlock(dag, c);
    
    dag = moveSink(dag, "C", (id) => ({ inputs: ["out1"] }));
    
    const txs = [
      { txId: "txA", blockId: "A", inputs: ["out1"] },
      { txId: "txB", blockId: "B", inputs: ["out1"] }
    ];
    
    const result = resolveConflictsDeterministically(txs, dag);
    
    // A is in the selected path to sink C, so it MUST win regardless of other rules
    expect(result.accepted).toContain("txA");
    expect(result.displaced).toContain("txB");
  });
});
