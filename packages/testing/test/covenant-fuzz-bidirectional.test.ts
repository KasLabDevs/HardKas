import { describe, it, expect } from "vitest";
import "../src/setup.js";
import {
  counterTransitionArbitrary,
  counterTransitionBoundarySamples,
  counterTransitionOracle,
  fuzzCounterTransitions,
  runBidirectionalCovenantFuzz,
  runCovenantPropertyFuzz,
  successorStateTransitionArbitrary,
  SILVER_INT_MAX,
  type CounterTransitionSample,
  type CovenantTransitionResult
} from "../src/index.js";

// -----------------------------------------------------------------------------
// Control 3 · bidirectional properties. Canonical level: no silverc, no runner — the verdicts come from synthetic
// evaluators that behave like a correct VM, a VM that rejects everything, one that accepts everything, one that rejects
// for the wrong reason, and runners that cannot give a verdict. The SCRIPT_VM properties on the real runner are in
// covenant-fuzz.silver-runner.test.ts; the same properties against stand-in runners through the testbed are in
// covenant-fuzz-standins.silverc.test.ts.
// -----------------------------------------------------------------------------

const RUNNER = {
  path: "/stand-in/cli-debugger",
  sha256: "ab".repeat(32),
  size: 1,
  source: "explicit-path" as const,
  provenance: "unmanaged-local-build" as const,
  trust: "UNVERIFIED" as const
};

type VmClass =
  | "SCRIPT_VM_PASS"
  | "SCRIPT_VM_REJECTED"
  | "RUNNER_PROTOCOL_ERROR"
  | "RUNNER_TIMEOUT"
  | "RUNNER_NOT_FOUND"
  | "RUNNER_UNVERIFIED";

/** A testbed result carrying the VM verdict `cls` (a rejection at `line`), as the testbed shapes them. */
function vmTransition(cls: VmClass, line?: number, runner: Record<string, unknown> = RUNNER): CovenantTransitionResult {
  const blocked = cls !== "SCRIPT_VM_PASS" && cls !== "SCRIPT_VM_REJECTED";
  const diagnostic =
    cls === "SCRIPT_VM_REJECTED"
      ? {
          message: "script ran, but verification failed",
          sourceLocationStatus: "RESOLVED" as const,
          ...(line !== undefined ? { location: { line, column: 9 } } : {}),
          frames: [],
          variables: {},
          isPreScriptContextError: false,
          rawStderr: ""
        }
      : undefined;
  const status = blocked ? "BLOCKED" : cls === "SCRIPT_VM_PASS" ? "SCRIPT_VM_PASS" : "SCRIPT_VM_FAIL";
  return {
    passed: cls === "SCRIPT_VM_PASS",
    evidenceLevel: "SCRIPT_VM",
    preflightLevel: "SCRIPT_VM_PREFLIGHT",
    status,
    structuralPassed: true,
    vmResult: {
      evidenceLevel: "SCRIPT_VM",
      status: status as any,
      outcomeClass: cls,
      passed: cls === "SCRIPT_VM_PASS",
      contractName: "OwnedCounter",
      entrypoint: "bump",
      exitCode: blocked ? null : cls === "SCRIPT_VM_PASS" ? 0 : 1,
      stdout: "",
      stderr: "",
      ...(diagnostic ? { diagnostic } : {}),
      ...(blocked ? { blockedReason: `${cls}: stand-in` } : {}),
      runnerIdentity: runner as any
    },
    ...(diagnostic ? { diagnostic } : {}),
    previousStates: [],
    successorUtxos: []
  };
}

/** A correct VM for OwnedCounter: the counter rule, rejections at line 14 (`require(delta > 0)`). */
const correctVm = async (s: CounterTransitionSample) =>
  counterTransitionOracle(s).expected === "ACCEPT" ? vmTransition("SCRIPT_VM_PASS") : vmTransition("SCRIPT_VM_REJECTED", 14);
const alwaysReject = async () => vmTransition("SCRIPT_VM_REJECTED", 14);
const alwaysAccept = async () => vmTransition("SCRIPT_VM_PASS");

const counterRun = (evaluate: (s: CounterTransitionSample) => Promise<CovenantTransitionResult>, extra: Record<string, unknown> = {}) =>
  runBidirectionalCovenantFuzz(counterTransitionArbitrary(), {
    propertyName: "owned-counter-bi-implication",
    backend: "SCRIPT_VM",
    numRuns: 20,
    seed: 20261030,
    boundarySamples: counterTransitionBoundarySamples(),
    minExpectedAccept: 3,
    minExpectedReject: 3,
    oracle: (s) => counterTransitionOracle(s, { deltaCheckLine: 14 }),
    evaluate,
    ...extra
  });

describe("Control 3 · the counter oracle", () => {
  it("BD1 the boundary samples are classified by the counter rule: both directions, every case, the int range edges", () => {
    const verdicts = counterTransitionBoundarySamples().map((s) => counterTransitionOracle(s, { deltaCheckLine: 14 }));
    expect(verdicts.map((v) => `${v.expected}:${v.reason}${v.rejectLine ? `@${v.rejectLine}` : ""}`)).toEqual([
      "ACCEPT:LEGITIMATE",
      "REJECT:NON_POSITIVE_DELTA@14",
      "REJECT:NON_POSITIVE_DELTA@14",
      "REJECT:STATE_MISMATCH",
      "REJECT:STATE_MISMATCH",
      "ACCEPT:LEGITIMATE",
      "ACCEPT:LEGITIMATE",
      "REJECT:OVERFLOW",
      "ACCEPT:LEGITIMATE",
      "ACCEPT:LEGITIMATE"
    ]);
    expect(counterTransitionBoundarySamples().some((s) => s.successorCount === SILVER_INT_MAX)).toBe(true);
  });

  it("BD2 the oracle recomputes legitimacy from the values and never trusts the sample's label", () => {
    // labelled legitimate, but the successor is not previous + delta (the old Property 5 drew such samples: its genesis
    // state was 10 whatever initialCount said)
    const mislabelled = { initialCount: 999_998n, delta: 6n, successorCount: 1_000_004n + 1n, isLegitimate: true, case: "LEGITIMATE" as const };
    expect(counterTransitionOracle(mislabelled).expected).toBe("REJECT");
  });

  it("BD3 the generator draws all three strata at a fixed seed", async () => {
    const seen = new Set<string>();
    await runBidirectionalCovenantFuzz(counterTransitionArbitrary(), {
      propertyName: "strata",
      backend: "SCRIPT_VM",
      numRuns: 30,
      seed: 7,
      minExpectedAccept: 0,
      minExpectedReject: 0,
      oracle: (s) => {
        seen.add(s.case);
        return counterTransitionOracle(s);
      },
      evaluate: correctVm
    });
    expect([...seen].sort()).toEqual(["LEGITIMATE", "NON_POSITIVE_DELTA", "STATE_MISMATCH"]);
  });
});

describe("Control 3 · a bidirectional run tells a correct VM from a broken one", () => {
  it("BD4 a correct VM passes: boundaries first, both directions counted, every verdict from the one runner", async () => {
    const r = await counterRun(correctVm);
    expect(r.outcome, r.failure?.error).toBe("PASS");
    expect(r.passed).toBe(true);
    expect(r.mode).toBe("BIDIRECTIONAL");
    expect(r.coverage.samples).toBe(30);
    expect(r.coverage.boundarySamples).toBe(10);
    expect(r.coverage.expectedAccept).toBeGreaterThanOrEqual(5);
    expect(r.coverage.expectedReject).toBeGreaterThanOrEqual(5);
    expect(r.coverage.vmVerdicts.SCRIPT_VM_PASS + r.coverage.vmVerdicts.SCRIPT_VM_REJECTED).toBe(30);
    expect(r.coverage.vmVerdicts.SCRIPT_VM_PASS).toBe(r.coverage.expectedAccept);
    expect(Object.keys(r.coverage.reasons).sort()).toEqual(["LEGITIMATE", "NON_POSITIVE_DELTA", "OVERFLOW", "STATE_MISMATCH"]);
    expect(r.runner?.sha256).toBe(RUNNER.sha256);
  });

  it("BD5 a VM that rejects everything fails: a legitimate sample observed REJECTED", async () => {
    const r = await counterRun(alwaysReject);
    expect(r.passed).toBe(false);
    expect(r.outcome).toBe("COUNTEREXAMPLE");
    expect(r.failure?.kind).toBe("COUNTEREXAMPLE");
    expect(r.failure?.error).toMatch(/^expected ACCEPT, observed REJECTED by the VM/);
    expect(r.failure?.shrunkCounterexample).toBeDefined();
    expect(counterTransitionOracle(reviveCounter(r.failure!.shrunkCounterexample)).expected).toBe("ACCEPT");
  });

  it("BD6 a VM that accepts everything fails: an illegitimate sample observed ACCEPTED", async () => {
    const r = await counterRun(alwaysAccept);
    expect(r.outcome).toBe("COUNTEREXAMPLE");
    expect(r.failure?.error).toMatch(/^expected REJECT, observed ACCEPTED/);
  });

  it("BD7 a VM that rejects for the wrong reason fails: a non-positive delta rejected at another line", async () => {
    const wrongLine = async (s: CounterTransitionSample) =>
      counterTransitionOracle(s).expected === "ACCEPT" ? vmTransition("SCRIPT_VM_PASS") : vmTransition("SCRIPT_VM_REJECTED", 13);
    const r = await counterRun(wrongLine);
    expect(r.outcome).toBe("COUNTEREXAMPLE");
    expect(r.failure?.error).toMatch(/^expected REJECT at line 14, observed REJECTED by the VM at line 13/);
  });

  it("BD8 the same seed gives the same run: samples, coverage and counterexample path", async () => {
    const a = await counterRun(alwaysReject);
    const b = await counterRun(alwaysReject);
    expect(b.failure?.path).toBe(a.failure?.path);
    expect(b.failure?.shrunkCounterexample).toEqual(a.failure?.shrunkCounterexample);
    const c = await counterRun(correctVm);
    const d = await counterRun(correctVm);
    expect(d.coverage).toEqual(c.coverage);
  });
});

describe("Control 3 · a runner that cannot give a verdict stops the run, never a counterexample", () => {
  it("BD9 a protocol error on the first sample: INFRASTRUCTURE_ERROR, evaluated once (no shrinking re-runs)", async () => {
    const r = await counterRun(async () => vmTransition("RUNNER_PROTOCOL_ERROR"));
    expect(r.passed).toBe(false);
    expect(r.outcome).toBe("INFRASTRUCTURE_ERROR");
    expect(r.failure?.kind).toBe("INFRASTRUCTURE");
    expect(r.infrastructureFailure?.outcomeClass).toBe("RUNNER_PROTOCOL_ERROR");
    expect(r.coverage.evaluations).toBe(1);
  });

  it("BD10 a timeout in the middle of the run: INFRASTRUCTURE_ERROR at that sample, nothing evaluated after it", async () => {
    let n = 0;
    const r = await counterRun(async (s) => (++n === 7 ? vmTransition("RUNNER_TIMEOUT") : correctVm(s)));
    expect(r.outcome).toBe("INFRASTRUCTURE_ERROR");
    expect(r.infrastructureFailure?.outcomeClass).toBe("RUNNER_TIMEOUT");
    expect(r.coverage.evaluations).toBe(7);
    expect(n).toBe(7);
  });

  it("BD11 an unverified or missing runner (refused by the trust policy before running): INFRASTRUCTURE_ERROR with its class", async () => {
    for (const cls of ["RUNNER_UNVERIFIED", "RUNNER_NOT_FOUND"] as const) {
      const r = await counterRun(async () => vmTransition(cls));
      expect(r.outcome).toBe("INFRASTRUCTURE_ERROR");
      expect(r.infrastructureFailure?.outcomeClass).toBe(cls);
    }
  });

  it("BD12 a SCRIPT_VM sample the VM never evaluated (refused structurally first): NO_VM_EVIDENCE, not a rejection", async () => {
    const structural: CovenantTransitionResult = {
      passed: false,
      evidenceLevel: "SYNTHETIC",
      preflightLevel: "STRUCTURAL_PREFLIGHT",
      status: "SYNTHETIC_FAIL",
      structuralPassed: false,
      structuralErrorCode: "FEE_BELOW_V1_FLOOR",
      previousStates: [],
      successorUtxos: []
    };
    const r = await counterRun(async () => structural);
    expect(r.outcome).toBe("NO_VM_EVIDENCE");
    expect(r.infrastructureFailure?.outcomeClass).toBe("NO_VM_VERDICT");
    expect(r.coverage.evaluations).toBe(1);
  });

  it("BD13 the runner changes during the run: INFRASTRUCTURE_ERROR RUNNER_CHANGED", async () => {
    let n = 0;
    const r = await counterRun(async (s) =>
      ++n < 4 ? correctVm(s) : { ...(await correctVm(s)), vmResult: { ...(await correctVm(s)).vmResult!, runnerIdentity: { ...RUNNER, sha256: "cd".repeat(32) } } }
    );
    expect(r.outcome).toBe("INFRASTRUCTURE_ERROR");
    expect(r.infrastructureFailure?.outcomeClass).toBe("RUNNER_CHANGED");
  });

  it("BD14 the testbed throws: EVALUATION_ERROR, evaluated once", async () => {
    const r = await counterRun(async () => {
      throw new Error("SILVER_STATE_INVALID: does not encode");
    });
    expect(r.outcome).toBe("EVALUATION_ERROR");
    expect(r.failure?.error).toMatch(/SILVER_STATE_INVALID/);
    expect(r.coverage.evaluations).toBe(1);
  });
});

describe("Control 3 · the old one-directional property was insufficient", () => {
  // the old Property 3 exactly: generator, seed, runs and predicate, judged by a VM that rejects everything
  const oldGenerator = () => successorStateTransitionArbitrary({ allowInvalidDelta: true, allowStateMismatch: true });

  it("BD15 BEFORE: the old Property 3 passes with a VM that rejects everything (its 12 samples are all illegitimate)", async () => {
    let legitimate = 0;
    const report = await runCovenantPropertyFuzz(
      oldGenerator(),
      async (sample) => {
        if (sample.isLegitimate) legitimate++;
        const res = await alwaysReject();
        expect(res.passed).toBe(sample.isLegitimate);
        if (!sample.isLegitimate) expect(res.status).toBe("SCRIPT_VM_FAIL");
      },
      { propertyName: "state-transition-bi-implication-script-vm", backend: "SCRIPT_VM", numRuns: 12, seed: 888002 }
    );
    expect(report.passed).toBe(true);
    expect(legitimate).toBe(0);
  });

  it("BD16 AFTER: the same samples through a bidirectional run are INSUFFICIENT_COVERAGE (no ACCEPT sample)", async () => {
    const r = await runBidirectionalCovenantFuzz(oldGenerator() as any, {
      propertyName: "state-transition-bi-implication-script-vm",
      backend: "SCRIPT_VM",
      numRuns: 12,
      seed: 888002,
      oracle: (s: any) => counterTransitionOracle(s),
      evaluate: alwaysReject
    });
    expect(r.passed).toBe(false);
    expect(r.outcome).toBe("INSUFFICIENT_COVERAGE");
    expect(r.coverage.expectedAccept).toBe(0);
    expect(r.failure?.error).toMatch(/^INSUFFICIENT_COVERAGE: .*cannot tell a correct VM from one that rejects everything/);
  });

  it("BD17 AFTER: with the boundary samples the same VM is caught at the first legitimate one", async () => {
    const r = await runBidirectionalCovenantFuzz(oldGenerator() as any, {
      propertyName: "state-transition-bi-implication-script-vm",
      backend: "SCRIPT_VM",
      numRuns: 12,
      seed: 888002,
      boundarySamples: counterTransitionBoundarySamples(),
      oracle: (s: any) => counterTransitionOracle(s),
      evaluate: alwaysReject
    });
    expect(r.outcome).toBe("COUNTEREXAMPLE");
    expect(r.failure?.originalInput).toMatchObject({ initialCount: "0n", delta: "1n", successorCount: "1n" });
  });
});

describe("Control 3 · fuzzCounterTransitions gives every sample its own covenant", () => {
  it("BD18 one genesis per sample, with the sample's own state; the transition spends that genesis and no other", async () => {
    const deployed: Array<{ state: unknown; utxo: string }> = [];
    let k = 0;
    const testbed: any = {
      getAccount: () => ({ privateKeyHex: "11".repeat(32), xOnlyPublicKey: "22".repeat(32) }),
      deployGenesis: async (p: any) => {
        const utxo = `genesis-${k++}`;
        deployed.push({ state: p.initialState.value, utxo });
        return { utxo: { outpoint: { transactionId: utxo, index: 0 } }, covenantId: "33".repeat(32) };
      },
      executeTransition: async (p: any) => {
        const last = deployed[deployed.length - 1]!;
        expect(p.utxo.outpoint.transactionId).toBe(last.utxo);
        expect(p.backends).toEqual(["SYNTHETIC", "SCRIPT_VM"]);
        const sample = { initialCount: last.state as bigint, delta: p.args[0].value, successorCount: p.nextStates[0].state.value } as any;
        return correctVm(sample);
      }
    };
    const r = await fuzzCounterTransitions(testbed, { contractName: "OwnedCounter" } as any, { numRuns: 6, seed: 1, deltaCheckLine: 14 });
    expect(r.outcome, r.failure?.error).toBe("PASS");
    expect(deployed.length).toBe(16);
    expect(new Set(deployed.map((d) => d.utxo)).size).toBe(16);
    expect(deployed[0]!.state).toBe(0n);
  });
});

/** Undo serializeBigIntSafe ("12n" → 12n) for a counter sample. */
function reviveCounter(x: any): CounterTransitionSample {
  const big = (v: unknown) => (typeof v === "string" && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : (v as bigint));
  return { ...x, initialCount: big(x.initialCount), delta: big(x.delta), successorCount: big(x.successorCount) };
}
