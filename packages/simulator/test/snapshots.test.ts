import { describe, it, expect } from "vitest";
import {
  createKaspaSimulator,
  SOMPI_PER_KAS
} from "../src/index.js";

describe("Snapshots & State Rollback (Anvil-Style)", () => {
  it("snapshots state and rolls back cleanly to the exact point in time", async () => {
    const sim = createKaspaSimulator({ automine: true });
    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;

    // Initial state: Alice has 500 KAS, Bob has 0
    sim.fund(alice, 500n * SOMPI_PER_KAS);
    expect(sim.ledger.getBalance(alice.address)).toBe(500n * SOMPI_PER_KAS);
    expect(sim.ledger.getBalance(bob.address)).toBe(0n);

    const initialDaa = sim.dag.getVirtualDaaScore();

    // Take snapshot
    const snapshotId = sim.snapshots.snapshot();
    expect(snapshotId.startsWith("snap_")).toBe(true);

    // Now execute payment: Alice sends 200 KAS to Bob
    await sim.transfer({
      from: alice,
      to: bob,
      amountSompi: 200n * SOMPI_PER_KAS
    });

    expect(sim.ledger.getBalance(bob.address)).toBe(200n * SOMPI_PER_KAS);
    expect(sim.dag.getVirtualDaaScore()).toBeGreaterThan(initialDaa);

    // Revert to snapshot!
    const reverted = sim.snapshots.revert(snapshotId);
    expect(reverted).toBe(true);

    // Verify state restored 100%
    expect(sim.ledger.getBalance(alice.address)).toBe(500n * SOMPI_PER_KAS);
    expect(sim.ledger.getBalance(bob.address)).toBe(0n);
    expect(sim.dag.getVirtualDaaScore()).toBe(initialDaa);
  });
});
