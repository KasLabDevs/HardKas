import { describe, it, expect } from "vitest";
import "../src/setup.js";
import {
  covenantTopologyArbitrary,
  runCovenantPropertyFuzz,
  MAX_SOMPI
} from "../src/index.js";

// R-02: the properties of this phase that need neither silverc nor a SilverScript runner run here, in the canonical
// gate. Property 4 (structural, compiles OwnedCounter) is in covenant-fuzz.silverc.test.ts; Properties 2, 3 and 5
// (SCRIPT_VM) are in covenant-fuzz.silver-runner.test.ts.

describe("Fase 3 · Property-Based Testing & Fuzzing for Covenants (PRUEBA E)", () => {
  it("Property 1 (Value Conservation across 1:1, 1:N, N:M Topologies): total outputs + fee equals total inputs and stays within [0, MAX_SOMPI]", async () => {
    const report = await runCovenantPropertyFuzz(
      covenantTopologyArbitrary(),
      (sample) => {
        const totalIn = sample.inputAmountsSompi.reduce((a, b) => a + b, 0n);
        const totalOut = sample.outputAmountsSompi.reduce((a, b) => a + b, 0n);
        expect(totalIn).toBeGreaterThan(0n);
        expect(totalIn).toBeLessThanOrEqual(MAX_SOMPI);
        expect(totalOut + sample.feeSompi).toBe(totalIn);
        expect(sample.outputAmountsSompi.every((v) => v > 0n)).toBe(true);
      },
      {
        propertyName: "covenant-topology-value-conservation",
        backend: "SYNTHETIC",
        numRuns: 100,
        seed: 20261029,
        testFile: "packages/testing/test/covenant-fuzz.test.ts"
      }
    );

    expect(report.passed).toBe(true);
    expect(report.numRuns).toBe(100);
  });
});
