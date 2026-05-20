import { describe, it, expect } from "vitest";
import { createTestHarness } from "@hardkas/testing";
import "@hardkas/testing/setup";

describe("Transfer workflow", () => {
  it("sends KAS from alice to bob", () => {
    const h = createTestHarness({ accounts: 3, initialBalance: 100_000_000_000n });
    const [alice, bob] = h.accountNames();

    const result = h.send({
      from: alice,
      to: bob,
      amountSompi: 10_000_000_000n
    });

    expect(result.receipt).toBeAccepted();
    expect(result.receipt).toHaveValidTxId();
  });

  it("rejects insufficient funds", () => {
    const h = createTestHarness({ accounts: 2, initialBalance: 10_000_000_000n });
    const [alice, bob] = h.accountNames();

    const result = h.send({
      from: alice,
      to: bob,
      amountSompi: 999_000_000_000n
    });

    expect(result.ok).toBe(false);
    expect(result.receipt).toBeFailed();
  });

  it("produces deterministic txId", () => {
    const h1 = createTestHarness({ accounts: 2, initialBalance: 100_000_000_000n });
    const h2 = createTestHarness({ accounts: 2, initialBalance: 100_000_000_000n });

    const r1 = h1.send({ from: h1.accountNames()[0], to: h1.accountNames()[1], amountSompi: 5_000_000_000n });
    const r2 = h2.send({ from: h2.accountNames()[0], to: h2.accountNames()[1], amountSompi: 5_000_000_000n });

    expect(r1.receipt.txId).toBe(r2.receipt.txId);
  });
});
