import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "../src/setup.js";
import {
  createCovenantTestbed,
  counterTransitionOracle,
  fuzzCounterAuthorization,
  fuzzCounterTransitions,
  successorStateTransitionArbitrary,
  runCovenantPropertyFuzz,
  type CompiledCovenantContract
} from "../src/index.js";

// R-02: SilverScript runner level. The SCRIPT_VM properties of covenant-fuzz: they compile OwnedCounter with the
// pinned silverc and execute it on the SilverScript runner (cli-debugger, a local build: UNVERIFIED, opted in by
// this level's config).
// Control 3: bidirectional. The old Properties 2 and 3 passed with a VM that rejects everything (Property 2 only drew
// forged signatures; Property 3's 12 samples at seed 888002 were all illegitimate). Now each property runs boundary
// samples of both directions first, needs a minimum of each, needs the VM's own verdict for every sample, and stops on a
// runner that gives none. The same properties against stand-in runners: covenant-fuzz-standins.silverc.test.ts.

const repoRoot = path.resolve(__dirname, "../../..");
const ownedCounterPath = path.join(
  repoRoot,
  "examples",
  "09-silver-reference",
  "contracts",
  "owned-counter.sil"
);
const TEST_FILE = "packages/testing/test/covenant-fuzz.silver-runner.test.ts";
// owned-counter.sil: line 13 `require(checkSig(s, owner));`, line 14 `require(delta > 0);`
const SIG_CHECK_LINE = 13;
const DELTA_CHECK_LINE = 14;

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

  it("Property 2 (Authorization Bi-Implication in SCRIPT_VM): a transition passes the Script VM if and only if the owner's key signed it; forged bytes and other keys are rejected at the signature check", async () => {
    const report = await fuzzCounterAuthorization(testbed, ownedCounter, {
      sigCheckLine: SIG_CHECK_LINE,
      numRuns: 12,
      seed: 777001,
      testFile: TEST_FILE
    });

    expect(report.outcome, report.failure?.error).toBe("PASS");
    expect(report.coverage.samples).toBe(16);
    expect(report.coverage.vmVerdicts.SCRIPT_VM_PASS).toBe(report.coverage.expectedAccept);
    expect(report.coverage.vmVerdicts.SCRIPT_VM_REJECTED).toBe(report.coverage.expectedReject);
    expect(report.coverage.expectedAccept).toBeGreaterThanOrEqual(1);
    expect(report.coverage.reasons.FORGED_SIGNATURE).toBeGreaterThanOrEqual(2);
    expect(report.coverage.reasons.WRONG_KEY_SIGNATURE).toBeGreaterThanOrEqual(1);
    expect(Object.keys(report.coverage.rejectLines)).toEqual([String(SIG_CHECK_LINE)]);
    expect(report.runner?.trust).toBe("UNVERIFIED");
    console.log("[FUZZ_COVERAGE_EVIDENCE]", JSON.stringify({ property: report.propertyName, seed: report.seed, coverage: report.coverage, runner: report.runner }));
  });

  it("Property 3 (State Transition Bi-Implication in SCRIPT_VM): transition passes SCRIPT_VM if and only if delta > 0 and new_state.value == prev_state.value + delta (int range edges included)", async () => {
    const report = await fuzzCounterTransitions(testbed, ownedCounter, {
      deltaCheckLine: DELTA_CHECK_LINE,
      numRuns: 12,
      seed: 888002,
      testFile: TEST_FILE
    });

    expect(report.outcome, report.failure?.error).toBe("PASS");
    expect(report.coverage.samples).toBe(22);
    expect(report.coverage.boundarySamples).toBe(10);
    expect(report.coverage.expectedAccept).toBeGreaterThanOrEqual(5);
    expect(report.coverage.expectedReject).toBeGreaterThanOrEqual(5);
    expect(report.coverage.vmVerdicts.SCRIPT_VM_PASS).toBe(report.coverage.expectedAccept);
    expect(Object.keys(report.coverage.reasons).sort()).toEqual(["LEGITIMATE", "NON_POSITIVE_DELTA", "OVERFLOW", "STATE_MISMATCH"]);
    expect(report.runner?.trust).toBe("UNVERIFIED");
    console.log("[FUZZ_COVERAGE_EVIDENCE]", JSON.stringify({ property: report.propertyName, seed: report.seed, coverage: report.coverage, runner: report.runner }));
  });

  it("Property 5 (Shrinking & Reproducible Counterexample Capture): captures seed, path, original input, and minimal shrunk counterexample when a property is violated", async () => {
    // Positive control first: the VM must accept a legitimate transition, or the false hypothesis below would "fail" for
    // any VM that rejects everything.
    const control = await testbed.deployGenesis({ contract: ownedCounter, initialState: { value: 10n }, amountSompi: 1_000_000_000n });
    const accepted = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: control.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 1n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 11n } }],
      backends: ["SYNTHETIC", "SCRIPT_VM"]
    });
    expect(accepted.status).toBe("SCRIPT_VM_PASS");

    // Intentionally test a false hypothesis ("any delta in [-500..500] passes SCRIPT_VM"). Every sample gets its own
    // covenant whose state is the sample's initial count (the old version reused one genesis of state 10, so its "failing"
    // samples were state mismatches or spent UTXOs, not the hypothesis failing). fast-check must shrink the counterexample
    // to delta = 0 from 0, with a reproducible seed and path.
    const hypothesis = async () =>
      runCovenantPropertyFuzz(
        successorStateTransitionArbitrary({
          allowInvalidDelta: true,
          allowStateMismatch: false
        }),
        async (sample) => {
          const genesis = await testbed.deployGenesis({ contract: ownedCounter, initialState: { value: sample.initialCount }, amountSompi: 1_000_000_000n });
          const res = await testbed.executeTransition({
            contract: ownedCounter,
            utxo: genesis.utxo,
            entrypoint: "bump",
            args: [
              { kind: "int", value: sample.delta },
              { kind: "signer", signer: "owner" }
            ],
            nextStates: [{ state: { value: sample.successorCount } }],
            backends: ["SYNTHETIC", "SCRIPT_VM"]
          });
          if (res.status === "BLOCKED") throw new Error(`BLOCKED: ${res.vmResult?.blockedReason}`);
          // Intentional assertion that fails when delta <= 0:
          if (!res.passed) {
            throw new Error(
              `SCRIPT_VM rejected delta=${sample.delta} at line ${res.diagnostic?.location?.line}: ${res.diagnostic?.message}`
            );
          }
        },
        {
          propertyName: "intentional-false-hypothesis-shrinking-demo",
          backend: "SCRIPT_VM",
          numRuns: 15,
          seed: 133742,
          testFile: TEST_FILE
        }
      );
    const report = await hypothesis();

    expect(report.passed).toBe(false);
    expect(report.failure).toBeDefined();
    expect(report.failure?.seed).toBe(133742);
    expect(report.failure?.path).toBeTruthy();
    expect(report.failure?.error).toBe(`SCRIPT_VM rejected delta=0 at line ${DELTA_CHECK_LINE}: script ran, but verification failed`);
    expect(report.failure?.reproduceCommand).toContain("seed=133742");
    // the first failing sample is one the counter rule refuses, and the shrunk one is the edge itself
    const revive = (v: unknown) => BigInt(String(v).replace(/n$/, ""));
    const original: any = report.failure?.originalInput;
    expect(
      counterTransitionOracle({ initialCount: revive(original.initialCount), delta: revive(original.delta), successorCount: revive(original.successorCount), isLegitimate: false, case: "NON_POSITIVE_DELTA" }).expected
    ).toBe("REJECT");
    expect(report.failure?.shrunkCounterexample).toEqual({ initialCount: "0n", delta: "0n", successorCount: "0n", isLegitimate: false });

    // Re-run with the exact same seed (133742) and verify 100% deterministic reproduction of path and shrunk counterexample
    const replayReport = await hypothesis();
    expect(replayReport.passed).toBe(false);
    expect(replayReport.failure?.seed).toBe(report.failure?.seed);
    expect(replayReport.failure?.path).toBe(report.failure?.path);
    expect(replayReport.failure?.numShrinks).toBe(report.failure?.numShrinks);
    expect(replayReport.failure?.originalInput).toEqual(report.failure?.originalInput);
    expect(replayReport.failure?.shrunkCounterexample).toEqual(report.failure?.shrunkCounterexample);
    console.log(
      "[FUZZ_DETERMINISM_EVIDENCE]",
      JSON.stringify(
        {
          run1: report.failure,
          run2: replayReport.failure
        },
        (_k, v) => (typeof v === "bigint" ? `${v.toString()}n` : v)
      )
    );
  });
});
