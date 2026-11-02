import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "@hardkas/testing/setup";
import {
  createCovenantTestbed,
  fuzzCounterAuthorization,
  fuzzCounterTransitions,
  type CompiledCovenantContract
} from "@hardkas/testing";

// Example 10 · SilverScript runner level (vitest.silver-runner.config.ts): compiles GuardedVaultCounter with the pinned
// silverc and executes it on the SilverScript runner, a local cli-debugger build. Upstream publishes no runner binary, so
// the runner is UNVERIFIED and runs only under the explicit opt-in this level's config declares
// (HARDKAS_SILVER_RUNNER_TRUST=allow-unverified): these are SCRIPT_VM verdicts of an unverified local runner, never a
// node's acceptance or a DAG confirmation (that is the simnet level: CONSENSUS_SIMNET).
// guarded-vault-counter.sil: line 12 `require(checkSig(s, owner));`, 13 `require(delta > 0);`, 15 the value guard.

const contractPath = path.resolve(__dirname, "../contracts/guarded-vault-counter.sil");
const TEST_FILE = "examples/10-covenant-dev-framework/test/guarded-vault-counter.silver-runner.test.ts";

describe("Example 10 · Covenant Dev Framework (GuardedVaultCounter)", () => {
  const source = fs.readFileSync(contractPath, "utf8");
  let testbed: ReturnType<typeof createCovenantTestbed>;
  let contract: CompiledCovenantContract;

  beforeAll(async () => {
    testbed = createCovenantTestbed();
    const owner = testbed.getAccount("owner");
    contract = await testbed.compileContract({
      source,
      sourceFile: "guarded-vault-counter.sil",
      constructorArgs: [`0x${owner.xOnlyPublicKey}`, 10n, 500_000n]
    });
  });

  it("2. executes legitimate transition in SCRIPT_VM with step-by-step trace and rejects value drain", async () => {
    const genesis = await testbed.deployGenesis({
      contract,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });

    // Valid transition (10 -> 15, fee = 300_000 <= max_fee = 500_000)
    const valid = await testbed.executeTransition({
      contract,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 15n } }],
      feeSompi: 300_000n,
      captureTrace: true
    });

    expect(valid).toPassCovenantTransition();
    expect(valid).toHaveCovenantState({ value: 15n });
    expect(valid).toPreserveCovenantId(genesis.covenantId);
    expect(valid.vmResult?.trace?.length).toBeGreaterThan(0);
    expect(valid.vmResult?.runnerIdentity?.trust).toBe("UNVERIFIED");

    // Value drain attempt (fee = 1_000_000 > max_fee = 500_000) rejected by SCRIPT_VM at line 15
    const drained = await testbed.executeTransition({
      contract,
      utxo: valid.successorUtxos[0]!,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 20n } }],
      feeSompi: 1_000_000n
    });

    expect(drained.structuralPassed).toBe(true);
    expect(drained.passed).toBe(false);
    expect(drained).toRejectWithScriptError(15);
  });

  it("3. satisfies property-based state transition invariants in SCRIPT_VM, in both directions", async () => {
    const report = await fuzzCounterTransitions(testbed, contract, {
      deltaCheckLine: 13,
      feeSompi: 300_000n,
      numRuns: 8,
      seed: 20261029,
      testFile: TEST_FILE
    });

    expect(report.outcome, report.failure?.error).toBe("PASS");
    expect(report.coverage.expectedAccept).toBeGreaterThanOrEqual(5);
    expect(report.coverage.expectedReject).toBeGreaterThanOrEqual(5);
    expect(report.coverage.vmVerdicts.SCRIPT_VM_PASS).toBe(report.coverage.expectedAccept);
    expect(report.coverage.vmVerdicts.SCRIPT_VM_REJECTED).toBe(report.coverage.expectedReject);
    console.log("[FUZZ_COVERAGE_EVIDENCE]", JSON.stringify({ property: report.propertyName, seed: report.seed, coverage: report.coverage, runner: report.runner }));
  });

  it("4. only the owner's key authorizes a transition in SCRIPT_VM, in both directions", async () => {
    const report = await fuzzCounterAuthorization(testbed, contract, {
      sigCheckLine: 12,
      feeSompi: 300_000n,
      numRuns: 8,
      seed: 20261029,
      testFile: TEST_FILE
    });

    expect(report.outcome, report.failure?.error).toBe("PASS");
    expect(report.coverage.expectedAccept).toBeGreaterThanOrEqual(1);
    expect(report.coverage.expectedReject).toBeGreaterThanOrEqual(3);
    expect(Object.keys(report.coverage.rejectLines)).toEqual(["12"]);
  });
});
