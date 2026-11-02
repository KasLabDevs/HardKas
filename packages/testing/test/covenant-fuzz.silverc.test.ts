import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "../src/setup.js";
import {
  createCovenantTestbed,
  fuzzComputeBudgetBounds,
  type CompiledCovenantContract
} from "../src/index.js";

// R-02: silverc level. The structural (SYNTHETIC) property of covenant-fuzz: it compiles OwnedCounter with the pinned
// silverc and needs no SilverScript runner.
// Control 3: bidirectional. The old Property 4 only drew out-of-bounds budgets and asserted a refusal, so a validation
// that refuses everything passed it. Now budgets within bounds must be accepted and each out-of-bounds kind refused with
// its own code; boundary budgets (0, 1.5, 1, estimate − 1, estimate, estimate + 1, 65535, 65536) run at every seed.

const repoRoot = path.resolve(__dirname, "../../..");
const ownedCounterPath = path.join(
  repoRoot,
  "examples",
  "09-silver-reference",
  "contracts",
  "owned-counter.sil"
);

describe("Fase 3 · Property-Based Testing & Fuzzing for Covenants (PRUEBA E)", () => {
  const ownedCounterSource = fs.readFileSync(ownedCounterPath, "utf8");
  let testbed: ReturnType<typeof createCovenantTestbed>;
  let ownedCounter: CompiledCovenantContract;

  beforeAll(async () => {
    testbed = createCovenantTestbed();
    const ownerAcct = testbed.getAccount("owner");
    ownedCounter = await testbed.compileContract({
      source: ownedCounterSource,
      sourceFile: "owned-counter.sil",
      constructorArgs: [`0x${ownerAcct.xOnlyPublicKey}`, 10n]
    });
  });

  it("Property 4 (Compute Budget Bounds, bidirectional): budgets within bounds are accepted and every out-of-bounds kind is refused with its own code before broadcast", async () => {
    const report = await fuzzComputeBudgetBounds(testbed, ownedCounter, {
      numRuns: 40,
      seed: 999003,
      testFile: "packages/testing/test/covenant-fuzz.silverc.test.ts"
    });

    expect(report.outcome, report.failure?.error).toBe("PASS");
    expect(report.passed).toBe(true);
    expect(report.backend).toBe("SYNTHETIC");
    expect(report.coverage.boundarySamples).toBe(8);
    expect(report.coverage.expectedAccept).toBeGreaterThanOrEqual(2);
    expect(report.coverage.observedAccepted).toBe(report.coverage.expectedAccept);
    expect(Object.keys(report.coverage.rejectCodes).sort()).toEqual([
      "COMPUTE_BUDGET_EXCEEDED",
      "COMPUTE_BUDGET_INSUFFICIENT",
      "COMPUTE_BUDGET_NON_POSITIVE",
      "TX_MASS_ABOVE_STANDARD_LIMIT"
    ]);
    console.log("[FUZZ_COVERAGE_EVIDENCE]", JSON.stringify({ property: report.propertyName, seed: report.seed, coverage: report.coverage }));
  });
});
