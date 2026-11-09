import { describe, it, expect } from "vitest";
import { createTestHarness } from "@hardkas/testing";

/**
 * Payment Workflow Test
 *
 * Demonstrates the HardKAS test harness: every test gets a fresh, in-memory localnet state (simulation only, no node).
 *
 * L-06 (2026-11-07): this file imported `hardkasTest`, which @hardkas/testing has not exported since 0.3.0-alpha. No gate
 * ran examples/*\/test, so the suite failed unnoticed ("hardkasTest is not a function"). It now runs in the canonical
 * gate and uses the harness the package does export.
 */
describe("Basic Payment", () => {
  it("plans and applies a payment between two harness accounts", () => {
    const h = createTestHarness({ networkId: "simnet" });
    const [alice, bob] = h.accountNames();
    expect(alice, "the harness provides named accounts").toBeTruthy();
    expect(bob).toBeTruthy();

    const amountSompi = 550_000_000n; // 5.5 KAS
    const r = h.send({ from: alice!, to: bob!, amountSompi });

    expect(r.ok).toBe(true);
    expect(r.plan, "a payment is planned before it is applied").toBeTruthy();
    expect(r.postBalance.to - r.preBalance.to).toBe(amountSompi);
    // the sender pays the amount and a fee
    expect(r.preBalance.from - r.postBalance.from).toBeGreaterThan(amountSompi);
  });

  it("refuses a payment larger than the sender's balance and leaves both balances unchanged", () => {
    const h = createTestHarness({ networkId: "simnet", initialBalance: 10_000_000_000n });
    const [alice, bob] = h.accountNames();
    const before = { alice: h.balanceOf(alice!), bob: h.balanceOf(bob!) };

    const r = h.send({ from: alice!, to: bob!, amountSompi: before.alice + 1n });

    expect(r.ok).toBe(false);
    expect(h.balanceOf(alice!)).toBe(before.alice);
    expect(h.balanceOf(bob!)).toBe(before.bob);
  });
});
