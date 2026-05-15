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
    store.insert(GENESIS_HASH, genesisGhostdagData());

    // Chain: Genesis -> A -> B -> C
    const dataA = engine.ghostdag([GENESIS_HASH], store);
    store.insert("A", dataA, [GENESIS_HASH]);
    const dataB = engine.ghostdag(["A"], store);
    store.insert("B", dataB, ["A"]);
    const dataC = engine.ghostdag(["B"], store);
    store.insert("C", dataC, ["B"]);

    const blocksToOrder = ["C", "B", "A", GENESIS_HASH].map(hash => ({
      hash,
      blueWork: store.getBlueWork(hash)!
    }));
    
    const sorted = sortBlocks(blocksToOrder).map(b => b.hash);
    
    expect(sorted[0]).toBe(GENESIS_HASH);
    expect(sorted[1]).toBe("A");
    expect(sorted[2]).toBe("B");
    expect(sorted[3]).toBe("C");
  });

  it("should match Diamond DAG ordering (Simple Fork/Merge)", () => {
    const store = new GhostdagStore();
    store.insert(GENESIS_HASH, genesisGhostdagData());

    /**
     *      Genesis
     *      /    \
     *     A      B
     *      \    /
     *       C
     */
    const dataA = engine.ghostdag([GENESIS_HASH], store);
    store.insert("A", dataA, [GENESIS_HASH]);
    const dataB = engine.ghostdag([GENESIS_HASH], store);
    store.insert("B", dataB, [GENESIS_HASH]);
    
    const dataC = engine.ghostdag(["A", "B"], store);
    store.insert("C", dataC, ["A", "B"]);

    expect(dataC.selectedParent).toBe("B");
    expect(dataC.blueScore).toBe(3); 

    const blocksToOrder = ["C", "B", "A", GENESIS_HASH].map(hash => ({
      hash,
      blueWork: store.getBlueWork(hash)!
    }));
    
    const sorted = sortBlocks(blocksToOrder).map(b => b.hash);
    
    expect(sorted[0]).toBe(GENESIS_HASH);
    expect(sorted[1]).toBe("A");
    expect(sorted[2]).toBe("B");
    expect(sorted[3]).toBe("C");
  });

  it("should handle Expected Divergence: heavy anti-cone (approximate nature)", () => {
    const store = new GhostdagStore();
    store.insert(GENESIS_HASH, genesisGhostdagData());
    
    const K = 3; // Small K for test
    const engineK3 = new ApproxGhostdagEngine(K);
    
    // Create K+2 parallel blocks
    const parallel = ["P1", "P2", "P3", "P4", "P5"];
    for (const p of parallel) {
      store.insert(p, engineK3.ghostdag([GENESIS_HASH], store), [GENESIS_HASH]);
    }
    
    const merge = engineK3.ghostdag(parallel, store);
    expect(parallel).toContain(merge.selectedParent);
    expect(merge.blueScore).toBeLessThanOrEqual(parallel.length);
  });
});
