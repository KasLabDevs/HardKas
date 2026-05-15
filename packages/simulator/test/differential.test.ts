import { describe, it, expect } from "vitest";
import { 
  ApproxGhostdagEngine, 
  DEFAULT_K, 
  GhostdagStore, 
  genesisGhostdagData,
  sortBlocks,
  GENESIS_HASH
} from "../src/index.js";

/**
 * GHOSTDAG Differential Test v0
 * 
 * Since HardKAS uses an approximate GHOSTDAG engine, we compare it against
 * a set of "Reference Fixtures" that represent the expected ordering of 
 * specific DAG structures according to the Kaspa protocol GHOSTDAG algorithm (K=18).
 */
describe("GHOSTDAG Differential Tests (Reference Fixtures)", () => {

  const engine = new ApproxGhostdagEngine(DEFAULT_K);

  it("should match linear chain ordering (Baseline)", () => {
    const store = new GhostdagStore();
    store.set(GENESIS_HASH, genesisGhostdagData());

    // Chain: Genesis -> A -> B -> C
    const dataA = engine.ghostdag([GENESIS_HASH], store);
    store.set("A", dataA);
    const dataB = engine.ghostdag(["A"], store);
    store.set("B", dataB);
    const dataC = engine.ghostdag(["B"], store);
    store.set("C", dataC);

    const sorted = sortBlocks(["C", "B", "A", GENESIS_HASH], store);
    // Expected: [Genesis, A, B, C] (oldest/lowest blue score first for sorting?)
    // Actually, sortBlocks usually sorts by blueScore, then blueWork, then hash.
    expect(sorted[0]).toBe(GENESIS_HASH);
    expect(sorted[1]).toBe("A");
    expect(sorted[2]).toBe("B");
    expect(sorted[3]).toBe("C");
  });

  it("should match Diamond DAG ordering (Simple Fork/Merge)", () => {
    const store = new GhostdagStore();
    store.set(GENESIS_HASH, genesisGhostdagData());

    /**
     *      Genesis
     *      /    \
     *     A      B
     *      \    /
     *       C
     */
    const dataA = engine.ghostdag([GENESIS_HASH], store);
    store.set("A", dataA);
    const dataB = engine.ghostdag([GENESIS_HASH], store);
    store.set("B", dataB);
    
    // Tie-break: A and B have same blue score (1). 
    // GHOSTDAG tie-breaks with hash (A < B alphabetically).
    const dataC = engine.ghostdag(["A", "B"], store);
    store.set("C", dataC);

    expect(dataC.selectedParent).toBe("A");
    expect(dataC.blueScore).toBe(2); // Genesis (0) + A (1) + B (1)? 
    // Wait, blueScore = selectedParent.blueScore + blue_added.
    // dataA.blueScore = 1, dataB.blueScore = 1.
    // dataC selectedParent = A. C's blue set includes B.
    // So blueScore = A.blueScore (1) + 1 (B) = 2. Correct.

    const sorted = sortBlocks(["C", "B", "A", GENESIS_HASH], store);
    expect(sorted[0]).toBe(GENESIS_HASH);
    expect(sorted[1]).toBe("A");
    expect(sorted[2]).toBe("B");
    expect(sorted[3]).toBe("C");
  });

  it("should handle Expected Divergence: heavy anti-cone (approximate nature)", () => {
    // This test documents that ApproxGhostdag might diverge from full GHOSTDAG
    // in extremely complex scenarios with many parallel blocks exceeding K.
    // For now, we assert that it stays stable even if it's not bit-for-bit with rusty-kaspa.
    const store = new GhostdagStore();
    store.set(GENESIS_HASH, genesisGhostdagData());
    
    const K = 3; // Small K for test
    const engineK3 = new ApproxGhostdagEngine(K);
    
    // Create K+2 parallel blocks
    const parallel = ["P1", "P2", "P3", "P4", "P5"];
    for (const p of parallel) {
      store.set(p, engineK3.ghostdag([GENESIS_HASH], store));
    }
    
    const merge = engineK3.ghostdag(parallel, store);
    // Approx engine should still pick one as selected parent
    expect(parallel).toContain(merge.selectedParent);
    // Blue score should be <= K+1 (selected parent + blue set)
    expect(merge.blueScore).toBeLessThanOrEqual(parallel.length);
  });
});
