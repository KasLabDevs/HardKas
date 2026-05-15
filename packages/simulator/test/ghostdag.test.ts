import { describe, it, expect } from "vitest";
import {
  GENESIS_HASH,
  findSelectedParent,
  sortBlocks,
  compareSortableBlocks,
  GhostdagStore,
  genesisGhostdagData,
  ApproxGhostdagEngine,
  DEFAULT_K,
  isDagAncestorOf,
  unorderedMergesetWithoutSelectedParent,
  headerWork,
} from "../src/index.js";
import type { BlockHash, SimBlock, SimBlockHeader, SortableBlock } from "../src/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeHash(byte: number): BlockHash {
  return byte.toString(16).padStart(2, "0").repeat(32);
}

function makeBlock(hash: BlockHash, parents: BlockHash[]): SimBlock {
  return {
    header: {
      hash,
      parents,
      timestampUs: 0,
      minerId: 0,
      bits: 1000,
      nonce: 0,
    },
  };
}

function setupEngine(k: number = DEFAULT_K) {
  const g = GENESIS_HASH;
  const blocks = new Map<BlockHash, SimBlock>();
  blocks.set(g, makeBlock(g, []));
  const store = new GhostdagStore();
  store.insert(g, genesisGhostdagData(g));
  const engine = new ApproxGhostdagEngine(k, g);
  return { blocks, store, engine, g };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Ordering Tests (from ordering.rs)
// ═══════════════════════════════════════════════════════════════════════════════

describe("GHOSTDAG Ordering", () => {
  it("higher blueWork is selected parent", () => {
    const low  = { hash: makeHash(1), blueWork: 100n };
    const high = { hash: makeHash(2), blueWork: 200n };
    expect(findSelectedParent([low, high])).toBe(high.hash);
  });

  it("hash tiebreak — higher hash wins", () => {
    const a = { hash: makeHash(0x01), blueWork: 100n };
    const b = { hash: makeHash(0x02), blueWork: 100n };
    expect(findSelectedParent([a, b])).toBe(b.hash);
  });

  it("sort blocks ascending by blueWork", () => {
    const blocks: SortableBlock[] = [
      { hash: makeHash(3), blueWork: 300n },
      { hash: makeHash(1), blueWork: 100n },
      { hash: makeHash(2), blueWork: 200n },
    ];
    const sorted = sortBlocks(blocks);
    expect(sorted[0]!.blueWork).toBe(100n);
    expect(sorted[1]!.blueWork).toBe(200n);
    expect(sorted[2]!.blueWork).toBe(300n);
  });

  it("sort blocks hash tiebreak ascending", () => {
    const blocks: SortableBlock[] = [
      { hash: makeHash(0x02), blueWork: 100n },
      { hash: makeHash(0x01), blueWork: 100n },
    ];
    const sorted = sortBlocks(blocks);
    expect(sorted[0]!.hash).toBe(makeHash(0x01));
  });

  it("single parent always selected", () => {
    const only = { hash: makeHash(0xAB), blueWork: 9999n };
    expect(findSelectedParent([only])).toBe(only.hash);
  });

  it("empty parents returns undefined", () => {
    expect(findSelectedParent([])).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Store Tests (from store.rs)
// ═══════════════════════════════════════════════════════════════════════════════

describe("GhostdagStore", () => {
  it("insert and read compact", () => {
    const store = new GhostdagStore();
    store.insert(GENESIS_HASH, genesisGhostdagData(GENESIS_HASH));
    expect(store.getBlueScore(GENESIS_HASH)).toBe(0);
    expect(store.getBlueWork(GENESIS_HASH)).toBe(0n);
    expect(store.getSelectedParent(GENESIS_HASH)).toBe(GENESIS_HASH);
  });

  it("missing hash returns undefined", () => {
    const store = new GhostdagStore();
    expect(store.getBlueScore(makeHash(0xFF))).toBeUndefined();
  });

  it("compact and full agree", () => {
    const store = new GhostdagStore();
    const sp = makeHash(1);
    store.insert(sp, {
      blueScore: 5,
      blueWork: 12345n,
      selectedParent: GENESIS_HASH,
      mergesetBlues: [GENESIS_HASH],
      mergesetReds: [],
      bluesAnticoneSizes: [0],
    });
    const full = store.getData(sp)!;
    expect(full.blueWork).toBe(store.getBlueWork(sp));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Reachability Tests (from approx_reachability.rs)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Reachability", () => {
  it("genesis is ancestor of everything", () => {
    const blocks = new Map<BlockHash, SimBlock>();
    expect(isDagAncestorOf(GENESIS_HASH, makeHash(1), blocks)).toBe(true);
  });

  it("ancestor in chain", () => {
    const g = GENESIS_HASH;
    const a = makeHash(0x01);
    const b = makeHash(0x02);
    const blocks = new Map<BlockHash, SimBlock>();
    blocks.set(g, makeBlock(g, []));
    blocks.set(a, makeBlock(a, [g]));
    blocks.set(b, makeBlock(b, [a]));
    expect(isDagAncestorOf(a, b, blocks)).toBe(true);
    expect(isDagAncestorOf(b, a, blocks)).toBe(false);
  });

  it("basic mergeset excludes selected chain", () => {
    const g = GENESIS_HASH;
    const a = makeHash(0x01);
    const b = makeHash(0x02);
    const c = makeHash(0x03);

    const blocks = new Map<BlockHash, SimBlock>();
    blocks.set(g, makeBlock(g, []));
    blocks.set(a, makeBlock(a, [g]));
    blocks.set(c, makeBlock(c, [g]));
    blocks.set(b, makeBlock(b, [a, c]));

    const bBlock = blocks.get(b)!;
    const mergeset = unorderedMergesetWithoutSelectedParent(bBlock, a, blocks);
    expect(mergeset).toContain(c);
    expect(mergeset).not.toContain(a);
    expect(mergeset).not.toContain(g);
  });

  it("mergeset empty for linear chain", () => {
    const g = GENESIS_HASH;
    const a = makeHash(0x01);
    const blocks = new Map<BlockHash, SimBlock>();
    blocks.set(g, makeBlock(g, []));
    blocks.set(a, makeBlock(a, [g]));
    const aBlock = blocks.get(a)!;
    const mergeset = unorderedMergesetWithoutSelectedParent(aBlock, g, blocks);
    expect(mergeset).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ApproxGhostdagEngine Tests (from approx_ghostdag.rs)
// ═══════════════════════════════════════════════════════════════════════════════

describe("ApproxGhostdagEngine", () => {
  it("genesis has zero score and work", () => {
    const { blocks, store, engine, g } = setupEngine();
    const genesis = blocks.get(g)!;
    const gd = engine.computeGhostdag(genesis, blocks, store);
    expect(gd.blueScore).toBe(0);
    expect(gd.blueWork).toBe(0n);
  });

  it("blueScore increases in linear chain", () => {
    const { blocks, store, engine, g } = setupEngine();
    const a = makeHash(0x01);
    const b = makeHash(0x02);

    blocks.set(a, makeBlock(a, [g]));
    const gdA = engine.computeGhostdag(blocks.get(a)!, blocks, store);
    store.insert(a, gdA);

    blocks.set(b, makeBlock(b, [a]));
    const gdB = engine.computeGhostdag(blocks.get(b)!, blocks, store);
    expect(gdB.blueScore).toBeGreaterThan(gdA.blueScore);
  });

  it("blueWork increases in linear chain", () => {
    const { blocks, store, engine, g } = setupEngine();
    const a = makeHash(0x01);
    const b = makeHash(0x02);

    blocks.set(a, makeBlock(a, [g]));
    const gdA = engine.computeGhostdag(blocks.get(a)!, blocks, store);
    store.insert(a, gdA);

    blocks.set(b, makeBlock(b, [a]));
    const gdB = engine.computeGhostdag(blocks.get(b)!, blocks, store);
    expect(gdB.blueWork).toBeGreaterThan(gdA.blueWork);
  });

  it("selectedParent is highest blueWork", () => {
    const { blocks, store, engine, g } = setupEngine();
    const a = makeHash(0x01);
    const c = makeHash(0x03);
    const d = makeHash(0x04);

    blocks.set(a, makeBlock(a, [g]));
    const gdA = engine.computeGhostdag(blocks.get(a)!, blocks, store);
    store.insert(a, gdA);

    // Give C much higher blueWork manually.
    blocks.set(c, makeBlock(c, [g]));
    store.insert(c, {
      blueScore: 1,
      blueWork: 2n ** 140n, // DERIVATION: Must be > headerWork(default bits 1000) which is ~2^128/1001
      selectedParent: g,
      mergesetBlues: [g, c],
      mergesetReds: [],
      bluesAnticoneSizes: [0, 0],
    });

    blocks.set(d, makeBlock(d, [a, c]));
    // Debugging requested by user
    // console.log(`gdStore.getBlueWork(a): ${gdStore.getBlueWork(a)}`);
    // console.log(`gdStore.getBlueWork(c): ${gdStore.getBlueWork(c)}`);

    const gdD = engine.computeGhostdag(blocks.get(d)!, blocks, store);
    expect(gdD.selectedParent).toBe(c);
  });

  it("K constraint limits blues in mergeset", () => {
    // K=1: SP + at most 1 other blue
    const { blocks, store, engine, g } = setupEngine(1);

    const siblings = [makeHash(1), makeHash(2), makeHash(3), makeHash(4)];
    for (const h of siblings) {
      blocks.set(h, makeBlock(h, [g]));
      const gd = engine.computeGhostdag(blocks.get(h)!, blocks, store);
      store.insert(h, gd);
    }

    const d = makeHash(0x10);
    blocks.set(d, makeBlock(d, siblings));
    const gdD = engine.computeGhostdag(blocks.get(d)!, blocks, store);
    expect(gdD.mergesetBlues.length).toBeLessThanOrEqual(2);
  });

  it("throws for non-genesis block with no parents", () => {
    const { blocks, store, engine } = setupEngine();
    const bad: SimBlock = {
      header: {
        hash: makeHash(0xFF),
        parents: [],
        timestampUs: 0,
        minerId: 0,
        bits: 1000,
        nonce: 0,
      },
    };
    blocks.set(bad.header.hash, bad);
    expect(() => engine.computeGhostdag(bad, blocks, store)).toThrow(
      "has no parents"
    );
  });

  it("parallel blocks both become blue with K=18", () => {
    const { blocks, store, engine, g } = setupEngine(18);
    const a = makeHash(0x01);
    const b = makeHash(0x02);
    const c = makeHash(0x03);

    blocks.set(a, makeBlock(a, [g]));
    const gdA = engine.computeGhostdag(blocks.get(a)!, blocks, store);
    store.insert(a, gdA);

    blocks.set(b, makeBlock(b, [g]));
    const gdB = engine.computeGhostdag(blocks.get(b)!, blocks, store);
    store.insert(b, gdB);

    // C references both A and B.
    blocks.set(c, makeBlock(c, [a, b]));
    const gdC = engine.computeGhostdag(blocks.get(c)!, blocks, store);

    // With K=18, both A and B should be blue in C's mergeset.
    expect(gdC.mergesetBlues).toContain(gdC.selectedParent);
    expect(gdC.mergesetReds).toHaveLength(0);
  });

  it("replay determinism — same DAG produces same GhostdagData", () => {
    function runSimulation() {
      const { blocks, store, engine, g } = setupEngine();
      const hashes = [makeHash(0x01), makeHash(0x02), makeHash(0x03)];

      blocks.set(hashes[0]!, makeBlock(hashes[0]!, [g]));
      const gd0 = engine.computeGhostdag(blocks.get(hashes[0]!)!, blocks, store);
      store.insert(hashes[0]!, gd0);

      blocks.set(hashes[1]!, makeBlock(hashes[1]!, [g]));
      const gd1 = engine.computeGhostdag(blocks.get(hashes[1]!)!, blocks, store);
      store.insert(hashes[1]!, gd1);

      blocks.set(hashes[2]!, makeBlock(hashes[2]!, [hashes[0]!, hashes[1]!]));
      const gd2 = engine.computeGhostdag(blocks.get(hashes[2]!)!, blocks, store);

      return gd2;
    }

    const run1 = runSimulation();
    const run2 = runSimulation();

    expect(run1.blueScore).toBe(run2.blueScore);
    expect(run1.blueWork).toBe(run2.blueWork);
    expect(run1.selectedParent).toBe(run2.selectedParent);
    expect(run1.mergesetBlues).toEqual(run2.mergesetBlues);
    expect(run1.mergesetReds).toEqual(run2.mergesetReds);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Work Calculation Test
// ═══════════════════════════════════════════════════════════════════════════════

describe("Work Calculation", () => {
  it("headerWork returns positive bigint", () => {
    const header: SimBlockHeader = {
      hash: makeHash(1),
      parents: [GENESIS_HASH],
      timestampUs: 0,
      minerId: 0,
      bits: 1000,
      nonce: 0,
    };
    const work = headerWork(header);
    expect(work).toBeGreaterThan(0n);
  });

  it("lower bits = more work", () => {
    const easy: SimBlockHeader = {
      hash: makeHash(1), parents: [], timestampUs: 0, minerId: 0, bits: 10000, nonce: 0,
    };
    const hard: SimBlockHeader = {
      hash: makeHash(2), parents: [], timestampUs: 0, minerId: 0, bits: 100, nonce: 0,
    };
    expect(headerWork(hard)).toBeGreaterThan(headerWork(easy));
  });
});
