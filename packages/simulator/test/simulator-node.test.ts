import { describe, it, expect } from "vitest";
import {
  createKaspaSimulator,
  SOMPI_PER_KAS
} from "../src/index.js";

describe("KaspaSimulatorNode Orchestrator", () => {
  it("bootstraps dev accounts and performs authenticated transfers", async () => {
    const sim = createKaspaSimulator({ automine: true });
    sim.bootstrapDevAccounts(1000n); // 1000 KAS each

    expect(sim.ledger.getBalance(sim.accounts.alice.address)).toBe(1000n * SOMPI_PER_KAS);
    expect(sim.ledger.getBalance(sim.accounts.bob.address)).toBe(1000n * SOMPI_PER_KAS);
    expect(sim.ledger.getBalance(sim.accounts.carol.address)).toBe(1000n * SOMPI_PER_KAS);

    // Alice transfers 150 KAS to Carol
    const tx = await sim.transfer({
      from: sim.accounts.alice,
      to: sim.accounts.carol,
      amountSompi: 150n * SOMPI_PER_KAS
    });

    expect(tx.transactionId).toBeDefined();
    expect(sim.ledger.getBalance(sim.accounts.carol.address)).toBe(1150n * SOMPI_PER_KAS);
    expect(sim.ledger.getBalance(sim.accounts.alice.address)).toBe(850n * SOMPI_PER_KAS - tx.feeSompi);
  });

  it("supports manual mining mode (automine: false)", async () => {
    const sim = createKaspaSimulator({ automine: false });
    sim.fund(sim.accounts.alice, 50n * SOMPI_PER_KAS);

    expect(sim.ledger.getBalance(sim.accounts.alice.address)).toBe(50n * SOMPI_PER_KAS);
    expect(sim.ledger.getBalance(sim.accounts.bob.address)).toBe(0n);

    // Transfer with automine off
    const tx = await sim.transfer({
      from: sim.accounts.alice,
      to: sim.accounts.bob,
      amountSompi: 20n * SOMPI_PER_KAS
    });

    // Transaction is in mempool, not yet confirmed!
    expect(sim.mempool.hasTransaction(tx.transactionId)).toBe(true);
    expect(sim.ledger.getBalance(sim.accounts.bob.address)).toBe(0n);

    // Now manually mine 1 block!
    sim.mine(1);

    // Now it is confirmed and removed from mempool
    expect(sim.mempool.hasTransaction(tx.transactionId)).toBe(false);
    expect(sim.ledger.getBalance(sim.accounts.bob.address)).toBe(20n * SOMPI_PER_KAS);
  });
});
