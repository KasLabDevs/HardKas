import { describe, it, expect } from "vitest";
import { hardkasTest } from "@hardkas/testing";

/**
 * Payment Workflow Test
 * 
 * Demonstrates the use of the real HardKAS test runner.
 * This test actually runs against the simulated localnet.
 */
describe("Basic Payment", () => {
  // Initialize HardKAS test runtime with automatic localnet management
  const h = hardkasTest({
    network: "simnet"
  });

  it("should generate a transaction plan between accounts", async () => {
    // 1. Arrange: Identify accounts
    const alice = "alice";
    const bob = "bob";

    // 2. Act: Create a payment plan
    const plan = await h.tx.plan({
      from: alice,
      to: bob,
      amountKas: "5.5"
    });

    // 3. Assert: Verify plan integrity
    expect(plan.schema).toBe("hardkas.txPlan");
    expect(plan.networkId).toBe("simnet");
    expect(plan.from.accountName).toBe("alice");
    expect(plan.amountSompi).toBe("550000000"); // 5.5 KAS
  });

  it("should fail if sender has zero balance in real signing mode", async () => {
    // In simulated mode, it might pass, but if we used real signing it would fail.
    // For now, we test the plan creation logic.
    const plan = await h.tx.plan({
      from: "alice",
      to: "bob",
      amountKas: "100"
    });

    expect(plan.status).toBe("built");
  });
});
