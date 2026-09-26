import { describe, it, expect } from "vitest";
import { systemRuntimeContext, parseKasToSompi } from "@hardkas/core";
import { createInitialLocalnetState, applySimulatedPayment, applySimulatedPlan } from "../src/index.js";

// Wave 1.4 · D-Q2.a / N4: ONE synthetic txId scheme, `synthetic-<planArtifactId>`
// with the 64 hex of the plan's identity; `simtx_*` is gone.

const ctx = systemRuntimeContext;

describe("Wave 1.4 · localnet synthetic txIds (N4)", () => {
  it("a simulated payment's receipt carries synthetic-<planArtifactId>", () => {
    const state = createInitialLocalnetState({ accounts: 2, initialBalanceSompi: parseKasToSompi("100") });
    const result = applySimulatedPayment(state, { from: "alice", to: "bob", amountSompi: parseKasToSompi("10") }, ctx);
    expect(result.ok).toBe(true);
    expect(result.planArtifact?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.receipt.txId).toBe(`synthetic-${result.planArtifact!.contentHash}`);
    expect(result.receipt.createdUtxoIds!.every((id) => id.startsWith(`synthetic-${result.planArtifact!.contentHash}:`))).toBe(true);
  });

  it("applySimulatedPlan without an explicit txId derives the same synthetic id from the plan identity", () => {
    const state = createInitialLocalnetState({ accounts: 2, initialBalanceSompi: parseKasToSompi("100") });
    const first = applySimulatedPayment(state, { from: "alice", to: "bob", amountSompi: parseKasToSompi("10") }, ctx);
    expect(first.ok).toBe(true);
    const replayed = applySimulatedPlan(state, first.planArtifact!, ctx);
    expect(replayed.ok).toBe(true);
    expect(replayed.receipt.txId).toBe(`synthetic-${first.planArtifact!.contentHash}`);
  });

  it("a failed simulated execution still uses the single scheme (synthetic- + 64 hex), never simtx_", () => {
    const state = createInitialLocalnetState({ accounts: 2, initialBalanceSompi: parseKasToSompi("1") });
    const failed = applySimulatedPayment(state, { from: "alice", to: "bob", amountSompi: parseKasToSompi("50") }, ctx);
    expect(failed.ok).toBe(false);
    expect(failed.receipt.status).toBe("failed");
    expect(failed.receipt.txId).toMatch(/^synthetic-[0-9a-f]{64}$/);
    expect(failed.receipt.txId).not.toMatch(/simtx_/);
    // Deterministic: same failure, same id.
    const again = applySimulatedPayment(state, { from: "alice", to: "bob", amountSompi: parseKasToSompi("50") }, ctx);
    expect(again.receipt.txId).toBe(failed.receipt.txId);
  });
});
