import { systemRuntimeContext } from '@hardkas/core';
import { describe, it, expect } from "vitest";
import { createTestHarness } from "../src/index.js";
import { verifyReplay } from "@hardkas/localnet";
import "../src/setup.js";

describe("Deterministic Replay Verification", () => {
  it("Success Path: replaying a valid transaction on clean state is reproducible bit-for-bit", () => {
    const h = createTestHarness({ accounts: 3, initialBalance: 100_000_000_000n });
    const [alice, bob] = h.accountNames();

    // 1. Capture the initial state before executing the payment
    const preState = structuredClone(h.state);

    // 2. Perform transaction to get deterministic plan and receipt
    const result = h.send({
      from: alice!,
      to: bob!,
      amountSompi: 10_000_000_000n,
    });

    expect(result.ok).toBe(true);
    expect(result.receipt).toBeAccepted();
    expect(result.plan).toBeDefined();

    // 3. Replay transaction and verify it yields the same results deterministically
    const report = verifyReplay(preState, result.plan!, result.receipt!, systemRuntimeContext);

    // 4. Assert invariants
    expect(report.invariantsOk).toBe(true);
    expect(report.planOk).toBe(true);
    expect(report.receiptOk).toBe(true);
    expect(report.divergences).toHaveLength(0);
    expect(report.errors).toHaveLength(0);
    expect(report.checks.workflowDeterministic).toBe("reproduced");
  });

  it("Pre-state Mismatch: verification fails if the starting state has been modified", () => {
    const h = createTestHarness({ accounts: 3, initialBalance: 100_000_000_000n });
    const [alice, bob] = h.accountNames();

    const preState = structuredClone(h.state);

    const result = h.send({
      from: alice!,
      to: bob!,
      amountSompi: 10_000_000_000n,
    });

    expect(result.ok).toBe(true);

    // Modify pre-state UTXOs to trigger a preStateHash divergence
    const badPreState = structuredClone(preState);
    if (badPreState.utxos.length > 0 && badPreState.utxos[0]) {
      badPreState.utxos[0].amountSompi = (BigInt(badPreState.utxos[0].amountSompi) + 1n).toString();
    }

    const report = verifyReplay(badPreState, result.plan!, result.receipt!, systemRuntimeContext);

    expect(report.invariantsOk).toBe(false);
    expect(report.checks.workflowDeterministic).toBe("diverged");
    expect(report.divergences.some(d => d.path === "preStateHash")).toBe(true);
    expect(report.errors.some(e => e.includes("preStateHash mismatch"))).toBe(true);
  });

  it("Plan Hash Mismatch: verification fails if the transaction plan was altered", () => {
    const h = createTestHarness({ accounts: 3, initialBalance: 100_000_000_000n });
    const [alice, bob] = h.accountNames();

    const preState = structuredClone(h.state);

    const result = h.send({
      from: alice!,
      to: bob!,
      amountSompi: 10_000_000_000n,
    });

    expect(result.ok).toBe(true);

    // Modify transaction plan amount to trigger a contentHash mismatch
    const badPlan = structuredClone(result.plan);
    badPlan.amountSompi = "99999999999";

    const report = verifyReplay(preState, badPlan, result.receipt!, systemRuntimeContext);

    expect(report.invariantsOk).toBe(false);
    expect(report.planOk).toBe(false);
    expect(report.errors.some(e => e.includes("contentHash mismatch"))).toBe(true);
  });

  it("Receipt Divergence: verification fails if execution results differ from original receipt", () => {
    const h = createTestHarness({ accounts: 3, initialBalance: 100_000_000_000n });
    const [alice, bob] = h.accountNames();

    const preState = structuredClone(h.state);

    const result = h.send({
      from: alice!,
      to: bob!,
      amountSompi: 10_000_000_000n,
    });

    expect(result.ok).toBe(true);

    // Modify the receipt's fee estimation to trigger a receipt divergence
    const badReceipt = structuredClone(result.receipt);
    badReceipt.feeSompi = (BigInt(badReceipt.feeSompi || "0") + 100n).toString();

    const report = verifyReplay(preState, result.plan!, badReceipt, systemRuntimeContext);

    expect(report.invariantsOk).toBe(false);
    expect(report.receiptOk).toBe(false);
    expect(report.divergences.some(d => d.path === "receipt.feeSompi")).toBe(true);
    expect(report.errors.some(e => e.includes("Receipt divergence at feeSompi"))).toBe(true);
  });
});
