import { systemRuntimeContext } from "@hardkas/core";
import { describe, it, expect } from "vitest";
import {
  createInitialLocalnetState,
  applySimulatedPayment,
  verifyReplay,
  calculateStateHash
} from "../src/index.js";
import { createTxPlanArtifact, calculateContentHash } from "@hardkas/artifacts";
import { parseKasToSompi } from "@hardkas/core";

describe("Replay Invariants", () => {
  it("should verify exact match for a successful transaction", () => {
    const state = createInitialLocalnetState({
      accounts: 2,
      initialBalanceSompi: parseKasToSompi("100")
    });

    const result = applySimulatedPayment(
      state,
      {
        from: "alice",
        to: "bob",
        amountSompi: parseKasToSompi("10")
      },
      systemRuntimeContext
    );
    if (!result.ok) {
        throw new Error("applySimulatedPayment failed: " + JSON.stringify(result.errors));
    }

    const report = verifyReplay(
      state,
      result.planArtifact!,
      result.receipt,
      systemRuntimeContext
    );
    if (!report.invariantsOk) console.log(report.errors);
    expect(report.invariantsOk).toBe(true);
  });

  it("should fail if plan is mutated (contentHash mismatch)", () => {
    const state = createInitialLocalnetState({ accounts: 2, initialBalanceSompi: parseKasToSompi("10") });
    const result = applySimulatedPayment(
      state,
      {
        from: "alice",
        to: "bob",
        amountSompi: parseKasToSompi("1")
      },
      systemRuntimeContext
    );
    if (!result.ok) {
        throw new Error("applySimulatedPayment failed in second test: " + JSON.stringify(result.errors));
    }

    const plan = JSON.parse(JSON.stringify(result.planArtifact));
    plan.amountSompi = "9999"; // Mutate amount

    const report = verifyReplay(state, plan, result.receipt, systemRuntimeContext);
    expect(report.invariantsOk).toBe(false);
    expect(report.errors[0]).toContain("contentHash mismatch");
  });

  it("should fail if preStateHash mismatch", () => {
    const state1 = createInitialLocalnetState({ initialBalanceSompi: parseKasToSompi("10") });
    const state2 = createInitialLocalnetState({ initialBalanceSompi: parseKasToSompi("20") });

    const result = applySimulatedPayment(
      state1,
      {
        from: "alice",
        to: "bob",
        amountSompi: parseKasToSompi("1")
      },
      systemRuntimeContext
    );
    if (!result.ok) {
        throw new Error("applySimulatedPayment failed in third test: " + JSON.stringify(result.errors));
    }

    const report = verifyReplay(
      state2,
      result.planArtifact!,
      result.receipt,
      systemRuntimeContext
    );
    expect(report.invariantsOk).toBe(false);
    expect(report.errors.some((e) => e.includes("preStateHash mismatch"))).toBe(true);
  });
});
