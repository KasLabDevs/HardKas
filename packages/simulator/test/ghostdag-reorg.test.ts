import { describe, it, expect } from "vitest";
import {
  createKaspaSimulator,
  GENESIS_HASH,
  DEFAULT_K,
  SOMPI_PER_KAS,
  ApproxGhostdagEngine,
  GhostdagStore,
  genesisGhostdagData
} from "../src/index.js";

describe("GHOSTDAG Competing Blocks, Reorganizations & UTXO Reversals", () => {
  it("competing blocks on Genesis: DAG tracks multiple tips and chooses sink via blueWork tiebreak", () => {
    const sim = createKaspaSimulator({ automine: false, bootstrapDevAccounts: true });
    const miner = sim.accounts.miner;

    expect(sim.dag.getTipHashes()).toEqual([GENESIS_HASH]);
    expect(sim.dag.getSink()).toBe(GENESIS_HASH);

    // Mine Block A1 explicitly parented on Genesis
    const blockA1 = sim.mine(1, miner.address, miner.scriptPublicKey, [GENESIS_HASH])[0]!;
    expect(blockA1).toBeDefined();
    expect(blockA1.header.parents).toEqual([GENESIS_HASH]);
    expect(sim.dag.getSink()).toBe(blockA1.header.hash);

    // Mine competing Block B1 also explicitly parented on Genesis
    const blockB1 = sim.mine(1, miner.address, miner.scriptPublicKey, [GENESIS_HASH])[0]!;
    expect(blockB1).toBeDefined();
    expect(blockB1.header.parents).toEqual([GENESIS_HASH]);

    // Both A1 and B1 must exist in the DAG as concurrent tips
    const tips = sim.dag.getTipHashes();
    expect(tips).toContain(blockA1.header.hash);
    expect(tips).toContain(blockB1.header.hash);
    expect(tips.length).toBe(2);

    // The sink is chosen deterministically by highest blueWork (or hash tiebreaker)
    const sink = sim.dag.getSink();
    expect([blockA1.header.hash, blockB1.header.hash]).toContain(sink);
  });

  it("chain extension: Branch B overtakes Branch A, triggering dynamic sink reorganization", () => {
    const sim = createKaspaSimulator({ automine: false, bootstrapDevAccounts: true });
    const miner = sim.accounts.miner;

    // Mine Branch A: Genesis -> A1
    const blockA1 = sim.mine(1, miner.address, miner.scriptPublicKey, [GENESIS_HASH])[0]!;

    // Mine Branch B: Genesis -> B1
    const blockB1 = sim.mine(1, miner.address, miner.scriptPublicKey, [GENESIS_HASH])[0]!;

    // Extend Branch B: B1 -> B2
    const blockB2 = sim.mine(1, miner.address, miner.scriptPublicKey, [blockB1.header.hash])[0]!;
    // Extend Branch B further: B2 -> B3
    const blockB3 = sim.mine(1, miner.address, miner.scriptPublicKey, [blockB2.header.hash])[0]!;

    // Blue work of B3 must be strictly greater than A1
    expect(blockB3.header.blueWork).toBeGreaterThan(blockA1.header.blueWork);

    // Verify DAG sink dynamically reorganizes to tip B3
    expect(sim.dag.getSink()).toBe(blockB3.header.hash);
    expect(sim.dag.getTipHashes()[0]).toBe(blockB3.header.hash);

    // Selected chain of B3 must trace: B1 -> B2 -> B3
    const selectedChainB3 = sim.dag.getSelectedChain(blockB3.header.hash);
    expect(selectedChainB3.map((b) => b.header.hash)).toEqual([
      blockB1.header.hash,
      blockB2.header.hash,
      blockB3.header.hash
    ]);
  });

  it("UTXO state reversal: transaction on abandoned Branch A is unconfirmed when reorganizing to Branch B", async () => {
    const sim = createKaspaSimulator({ automine: false, bootstrapDevAccounts: true });
    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;
    const miner = sim.accounts.miner;

    const initialAliceBalance = sim.ledger.getBalance(alice.address);
    const initialBobBalance = sim.ledger.getBalance(bob.address);
    expect(initialAliceBalance).toBe(1000n * SOMPI_PER_KAS);
    expect(initialBobBalance).toBe(1000n * SOMPI_PER_KAS);

    // Snapshot state at fork point (Genesis with bootstrapped dev accounts)
    const forkSnapshot = sim.snapshot();

    // ── Branch A ──
    // Alice sends 100 KAS to Bob in mempool
    const transferAmount = 100n * SOMPI_PER_KAS;
    const { transactionId: txAId } = await sim.transfer({
      from: alice,
      to: bob,
      amountSompi: transferAmount
    });

    // Mine TxA into Block A1 (parent: Genesis)
    const blockA1 = sim.mine(1, miner.address, miner.scriptPublicKey, [GENESIS_HASH])[0]!;
    // SIM-13: A1 contains TxA; it is accepted by the chain block that merges A1, not by A1 itself
    expect(blockA1.transactionIds).toContain(txAId);
    expect(blockA1.acceptedTransactionIds).not.toContain(txAId);

    // In Branch A: Bob has +100 KAS, Alice has spent ~100 KAS
    expect(sim.ledger.getBalance(bob.address)).toBe(initialBobBalance + transferAmount);
    expect(sim.ledger.getBalance(alice.address)).toBeLessThan(initialAliceBalance);

    // ── Branch B ──
    // Mine competing blocks B1 and B2 (parents: Genesis -> B1 -> B2) WITHOUT TxA
    const blockB1 = sim.mine(1, miner.address, miner.scriptPublicKey, [GENESIS_HASH])[0]!;
    const blockB2 = sim.mine(1, miner.address, miner.scriptPublicKey, [blockB1.header.hash])[0]!;

    // Reorganize state to Branch B tip B2
    const reorgSuccess = sim.reorganizeToTip(blockB2.header.hash, forkSnapshot);
    expect(reorgSuccess).toBe(true);

    // State on Branch B:
    // 1. DAG sink is now Block B2
    expect(sim.dag.getSink()).toBe(blockB2.header.hash);

    // 2. TxA is REVERTED: Bob's balance returns to initial (no 100 KAS from TxA)
    expect(sim.ledger.getBalance(bob.address)).toBe(initialBobBalance);

    // 3. Alice's balance is RESTORED to initial 1000 KAS (unspent)
    expect(sim.ledger.getBalance(alice.address)).toBe(initialAliceBalance);

    // 4. Miner receives block rewards for B1 and B2
    const minerBalance = sim.ledger.getBalance(miner.address);
    expect(minerBalance).toBeGreaterThan(0n);
  });

  it("mergeset & anticone coloring: a block merging both tips selects heavier parent and computes mergeset", () => {
    const sim = createKaspaSimulator({ automine: false });
    const miner = sim.accounts.miner;

    // Mine Branch A: Genesis -> A1
    const blockA1 = sim.mine(1, miner.address, miner.scriptPublicKey, [GENESIS_HASH])[0]!;

    // Mine Branch B: Genesis -> B1 -> B2
    const blockB1 = sim.mine(1, miner.address, miner.scriptPublicKey, [GENESIS_HASH])[0]!;
    const blockB2 = sim.mine(1, miner.address, miner.scriptPublicKey, [blockB1.header.hash])[0]!;

    // Merge block M: parents = [B2, A1]
    const blockM = sim.mine(1, miner.address, miner.scriptPublicKey, [
      blockB2.header.hash,
      blockA1.header.hash
    ])[0]!;

    // GHOSTDAG selected parent of M must be B2 because BlueWork(B2) > BlueWork(A1)
    expect(blockM.header.selectedParent).toBe(blockB2.header.hash);

    // Cumulative blue work advances beyond both parents
    expect(blockM.header.blueWork).toBeGreaterThan(blockB2.header.blueWork);
    expect(blockM.header.blueWork).toBeGreaterThan(blockA1.header.blueWork);

    // Sink of the DAG is now M
    expect(sim.dag.getSink()).toBe(blockM.header.hash);
  });

  it("verifies and documents faithful vs approximate rules boundary", () => {
    // 1. Approximate engine reports structural approximation
    const engine = new ApproxGhostdagEngine(DEFAULT_K, GENESIS_HASH);
    expect(engine.k).toBe(18);

    // 2. Genesis data conforms to deterministic base
    const gData = genesisGhostdagData(GENESIS_HASH);
    expect(gData.blueScore).toBe(0);
    expect(gData.blueWork).toBe(0n);
    expect(gData.selectedParent).toBe(GENESIS_HASH);
    expect(gData.mergesetBlues).toEqual([GENESIS_HASH]);
    expect(gData.mergesetReds).toEqual([]);

    // 3. Ensure store handles parent tracking and blue work queries
    const store = new GhostdagStore();
    store.insert(GENESIS_HASH, gData, []);
    expect(store.getBlueScore(GENESIS_HASH)).toBe(0);
    expect(store.getBlueWork(GENESIS_HASH)).toBe(0n);
  });
});
