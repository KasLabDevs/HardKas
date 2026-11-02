// SAFETY_LEVEL: SIMULATION_ONLY
//
// @hardkas/testing — Property-Based Testing & Fuzzing for SilverScript Covenants.
//
// Built on `fast-check` with domain-specific Kaspa L1 / Toccata / SilverScript v1.0.0
// arbitraries and structured counterexample/shrinking reports across SYNTHETIC and SCRIPT_VM.

import fc from "fast-check";
import type { SilverRunnerIdentity } from "@hardkas/core";
import { HARDKAS_FIXTURE_NAMES, type HardkasFixtureName } from "./fixture-signer.js";
import type {
  CompiledCovenantContract,
  CovenantEvidenceLevel,
  CovenantTransitionResult,
  createCovenantTestbed
} from "./covenant-testbed.js";

/** Maximum Kaspa supply in sompi (~28.7B KAS = 2_870_000_000_000_000_000 sompi). */
export const MAX_SOMPI = 2_870_000_000_000_000_000n;
/** Standard dust threshold in sompi for test covenants. */
export const MIN_NON_DUST_SOMPI = 10_000n;

export type CovenantTopologyKind = "1:1" | "1:N" | "N:M";

export interface CovenantTopologySample {
  kind: CovenantTopologyKind;
  inputCount: number;
  outputCount: number;
  activeInputIndex: number;
  authorizingInputIndex: number;
  inputAmountsSompi: bigint[];
  outputAmountsSompi: bigint[];
  feeSompi: bigint;
}

export interface CovenantFuzzRunOptions {
  /** Property name for reporting. */
  propertyName: string;
  /** Evidence backend used to evaluate the property. */
  backend: CovenantEvidenceLevel;
  /** Number of test iterations (default: 50 for SYNTHETIC, 20 for SCRIPT_VM). */
  numRuns?: number;
  /** Optional deterministic RNG seed. */
  seed?: number;
  /** Optional fast-check replay path for deterministic reproduction. */
  path?: string;
  /** Command template used to build `reproduceCommand`. */
  testFile?: string;
}

export interface CovenantFuzzFailureReport<TInput = unknown> {
  /**
   * Bidirectional runs only: why the property failed. COUNTEREXAMPLE: a sample's verdict contradicts the oracle (shrunk).
   * INFRASTRUCTURE: the runner could not give a verdict (never a contract rejection). NO_VM_EVIDENCE: a SCRIPT_VM sample
   * the VM did not evaluate. EVALUATION_ERROR: the testbed threw. INSUFFICIENT_COVERAGE: too few samples of one direction.
   */
  kind?: "COUNTEREXAMPLE" | "INFRASTRUCTURE" | "NO_VM_EVIDENCE" | "EVALUATION_ERROR" | "INSUFFICIENT_COVERAGE";
  seed: number;
  path: string;
  numRunsCompleted: number;
  numShrinks: number;
  originalInput?: TInput;
  /** Absent when no sample failed (INSUFFICIENT_COVERAGE). */
  shrunkCounterexample?: TInput;
  backend: CovenantEvidenceLevel;
  error: string;
  reproduceCommand: string;
}

export interface CovenantFuzzReport<TInput = unknown> {
  schema: "hardkas.covenant.fuzz.report.v1";
  propertyName: string;
  backend: CovenantEvidenceLevel;
  passed: boolean;
  seed: number;
  numRuns: number;
  durationMs: number;
  failure?: CovenantFuzzFailureReport<TInput>;
}

function serializeBigIntSafe(value: unknown): unknown {
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (Array.isArray(value)) return value.map(serializeBigIntSafe);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeBigIntSafe(v);
    }
    return out;
  }
  return value;
}

// ── Domain Arbitraries ────────────────────────────────────────────────────────

/**
 * Generates sompi amounts within `[min, max]`, biased toward boundary values
 * (dust threshold, fee boundaries, large balances).
 */
export function sompiAmountArbitrary(
  min: bigint = MIN_NON_DUST_SOMPI,
  max: bigint = 100_000_000_000n
): fc.Arbitrary<bigint> {
  return fc.bigInt({ min, max });
}

/**
 * Generates a 64-character lowercase hex string suitable for txIds or covenantIds.
 */
export function covenantIdHexArbitrary(): fc.Arbitrary<string> {
  return fc.uint8Array({ minLength: 32, maxLength: 32 }).map((bytes) => Buffer.from(bytes).toString("hex"));
}

/**
 * Generates a corrupted covenantId that is guaranteed to differ from `expectedCovenantId`.
 */
export function corruptedCovenantIdArbitrary(expectedCovenantId: string): fc.Arbitrary<string> {
  const clean = expectedCovenantId.toLowerCase();
  return covenantIdHexArbitrary().filter((candidate) => candidate.toLowerCase() !== clean);
}

/**
 * Generates a deterministic UTXO fixture parameter tuple.
 */
export function covenantUtxoArbitrary(options?: {
  minAmountSompi?: bigint;
  maxAmountSompi?: bigint;
  maxVout?: number;
}): fc.Arbitrary<{
  txId: string;
  vout: number;
  amountSompi: bigint;
  covenantId: string;
  daaScore: bigint;
}> {
  return fc.record({
    txId: covenantIdHexArbitrary(),
    vout: fc.integer({ min: 0, max: options?.maxVout ?? 7 }),
    amountSompi: sompiAmountArbitrary(
      options?.minAmountSompi ?? 100_000n,
      options?.maxAmountSompi ?? 50_000_000_000n
    ),
    covenantId: covenantIdHexArbitrary(),
    daaScore: fc.bigInt({ min: 1_000n, max: 10_000_000n })
  });
}

/**
 * Generates integer state values and deltas (`int` in SilverScript = signed 64-bit integer).
 */
export function int64StateArbitrary(options?: {
  min?: bigint;
  max?: bigint;
}): fc.Arbitrary<bigint> {
  return fc.bigInt({
    min: options?.min ?? 0n,
    max: options?.max ?? 1_000_000_000n
  });
}

/**
 * Generates valid or invalid successor state transitions for counter/accumulator covenants.
 */
export function successorStateTransitionArbitrary(options?: {
  allowInvalidDelta?: boolean;
  allowStateMismatch?: boolean;
}): fc.Arbitrary<{
  initialCount: bigint;
  delta: bigint;
  successorCount: bigint;
  isLegitimate: boolean;
}> {
  return fc
    .record({
      initialCount: fc.bigInt({ min: 0n, max: 1_000_000n }),
      delta: fc.bigInt({
        min: options?.allowInvalidDelta ? -500_000n : 1n,
        max: 500_000n
      }),
      perturbation: options?.allowStateMismatch
        ? fc.bigInt({ min: -100_000n, max: 100_000n })
        : fc.constant(0n)
    })
    .map(({ initialCount, delta, perturbation }) => {
      const successorCount = initialCount + delta + perturbation;
      const isLegitimate = delta > 0n && perturbation === 0n;
      return {
        initialCount,
        delta,
        successorCount,
        isLegitimate
      };
    });
}

/**
 * Generates malformed or forged 65-byte Schnorr signature hex strings (`64-byte sig || sighashType`).
 */
export function invalidSignatureHexArbitrary(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.uint8Array({ minLength: 64, maxLength: 64 }),
      fc.constantFrom(0x01, 0x02, 0x03, 0x81)
    )
    .map(([sigBytes, sighash]) => {
      // Ensure non-zero deterministic forgery bytes
      const buf = Buffer.alloc(65);
      Buffer.from(sigBytes).copy(buf, 0);
      if (buf.subarray(0, 64).every((b) => b === 0)) {
        buf[0] = 0x42;
      }
      buf[64] = sighash;
      return buf.toString("hex");
    });
}

/**
 * Generates a fixture signer name that is guaranteed NOT to be `authorizedOwner`.
 */
export function unauthorizedFixtureSignerArbitrary(
  authorizedOwner: HardkasFixtureName = "alice"
): fc.Arbitrary<HardkasFixtureName> {
  const candidates = HARDKAS_FIXTURE_NAMES.filter((name) => name !== authorizedOwner);
  return fc.constantFrom(...candidates);
}

/**
 * Generates compute budgets in the valid range (`[minValid, maxValid]`).
 */
export function computeBudgetArbitrary(
  minValid = 20_000,
  maxValid = 500_000
): fc.Arbitrary<number> {
  return fc.integer({ min: minValid, max: maxValid });
}

/**
 * Generates out-of-bounds compute budgets (either non-positive, below script estimate, or above max).
 */
export function invalidComputeBudgetArbitrary(
  minRequiredByScript = 5_000,
  maxAllowedByPolicy = 1_000_000
): fc.Arbitrary<number> {
  return fc.oneof(
    fc.integer({ min: -10_000, max: 0 }),
    fc.integer({ min: 1, max: Math.max(1, minRequiredByScript - 1) }),
    fc.integer({ min: maxAllowedByPolicy + 1, max: maxAllowedByPolicy * 5 })
  );
}

/**
 * Generates `1:1`, `1:N`, and `N:M` covenant transaction topologies that conserve value.
 */
export function covenantTopologyArbitrary(
  kind?: CovenantTopologyKind
): fc.Arbitrary<CovenantTopologySample> {
  const kindArb: fc.Arbitrary<CovenantTopologyKind> = kind
    ? fc.constant(kind)
    : fc.constantFrom("1:1", "1:N", "N:M");

  return kindArb.chain((selectedKind) => {
    const inputCountArb =
      selectedKind === "N:M" ? fc.integer({ min: 2, max: 5 }) : fc.constant(1);
    const outputCountArb =
      selectedKind === "1:1" ? fc.constant(1) : fc.integer({ min: 2, max: 5 });

    return fc
      .tuple(
        inputCountArb,
        outputCountArb,
        fc.bigInt({ min: 1_000n, max: 50_000n })
      )
      .chain(([inputCount, outputCount, feeSompi]) =>
        fc
          .tuple(
            fc.array(fc.bigInt({ min: 200_000n, max: 10_000_000n }), {
              minLength: inputCount,
              maxLength: inputCount
            }),
            fc.integer({ min: 0, max: inputCount - 1 }),
            fc.integer({ min: 0, max: inputCount - 1 }),
            fc.array(fc.integer({ min: 1, max: 100 }), {
              minLength: outputCount,
              maxLength: outputCount
            })
          )
          .map(([inputAmountsSompi, activeInputIndex, authorizingInputIndex, weights]) => {
            const totalIn = inputAmountsSompi.reduce((acc, v) => acc + v, 0n);
            const distributable = totalIn - feeSompi;
            const totalWeight = BigInt(weights.reduce((acc, w) => acc + w, 0));
            const outputAmountsSompi: bigint[] = [];
            let allocated = 0n;
            for (let i = 0; i < outputCount; i++) {
              if (i === outputCount - 1) {
                outputAmountsSompi.push(distributable - allocated);
              } else {
                const share = (distributable * BigInt(weights[i]!)) / totalWeight;
                outputAmountsSompi.push(share);
                allocated += share;
              }
            }
            return {
              kind: selectedKind,
              inputCount,
              outputCount,
              activeInputIndex,
              authorizingInputIndex,
              inputAmountsSompi,
              outputAmountsSompi,
              feeSompi
            };
          })
      );
  });
}

// ── Property Runner with Shrinking & Counterexample Capture ──────────────────

/**
 * Executes an async or sync property over a `fast-check` arbitrary, capturing the
 * initial failing input, the final shrunk counterexample, the deterministic seed/path,
 * and a copy-pasteable reproduction command.
 */
export async function runCovenantPropertyFuzz<TInput>(
  arbitrary: fc.Arbitrary<TInput>,
  predicate: (input: TInput) => Promise<void | boolean> | void | boolean,
  options: CovenantFuzzRunOptions
): Promise<CovenantFuzzReport<TInput>> {
  const startMs = Date.now();
  const numRuns =
    options.numRuns ?? (options.backend === "SCRIPT_VM" ? 20 : 50);
  const seed = options.seed ?? 424242;

  let firstFailingInput: TInput | undefined;
  let failureCount = 0;
  let lastErrorMessage = "";

  const asyncProp = fc.asyncProperty(arbitrary, async (sample) => {
    try {
      const res = await predicate(sample);
      if (res === false) {
        failureCount++;
        if (firstFailingInput === undefined) {
          firstFailingInput = sample;
        }
        lastErrorMessage = "Property predicate returned false";
        return false;
      }
      return true;
    } catch (err) {
      failureCount++;
      if (firstFailingInput === undefined) {
        firstFailingInput = sample;
      }
      lastErrorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    }
  });

  const details = await fc.check(asyncProp, {
    numRuns,
    seed,
    ...(options.path ? { path: options.path } : {})
  });

  const durationMs = Date.now() - startMs;
  if (!details.failed) {
    return {
      schema: "hardkas.covenant.fuzz.report.v1",
      propertyName: options.propertyName,
      backend: options.backend,
      passed: true,
      seed: details.seed,
      numRuns: details.numRuns,
      durationMs
    };
  }

  const shrunk = (details.counterexample?.[0] ?? firstFailingInput) as TInput;
  const counterexamplePath = details.counterexamplePath ?? "";
  const rawErr = (details as any).errorInstance ?? (details as any).error;
  const errorText = rawErr
    ? rawErr instanceof Error
      ? rawErr.message
      : String(rawErr)
    : lastErrorMessage || "Property failed";
  const targetCmd = options.testFile
    ? `pnpm vitest run ${options.testFile} --coverage=false`
    : `pnpm hardkas silver fuzz`;
  const reproduceCommand = `${targetCmd} # seed=${details.seed} path="${counterexamplePath}"`;

  return {
    schema: "hardkas.covenant.fuzz.report.v1",
    propertyName: options.propertyName,
    backend: options.backend,
    passed: false,
    seed: details.seed,
    numRuns: details.numRuns,
    durationMs,
    failure: {
      seed: details.seed,
      path: counterexamplePath,
      numRunsCompleted: details.numRuns,
      numShrinks: details.numShrinks ?? Math.max(0, failureCount - 1),
      ...(firstFailingInput !== undefined
        ? { originalInput: serializeBigIntSafe(firstFailingInput) as TInput }
        : {}),
      shrunkCounterexample: serializeBigIntSafe(shrunk) as TInput,
      backend: options.backend,
      error: errorText,
      reproduceCommand
    }
  };
}

// ── Bidirectional properties ──────────────────────────────────────────────────
//
// A property checked in one direction cannot tell a correct verifier from a broken one: "every forged signature is
// rejected" holds for a VM that rejects everything, and "passed === isLegitimate" holds too when the run happens to draw
// no legitimate sample (the old properties did, at their seeds: control 3, evidence h01/h03). A bidirectional run judges
// every sample against an oracle decided from the sample alone, always runs deterministic boundary samples of both
// directions first, requires a minimum of each direction, requires the VM's own verdict for every SCRIPT_VM sample, and
// stops on a runner that cannot give one instead of counting it as a rejection.

/** What must happen to a sample, decided from the sample alone (never from the result). */
export type CovenantFuzzExpectation = "ACCEPT" | "REJECT";

export interface CovenantFuzzOracleVerdict {
  readonly expected: CovenantFuzzExpectation;
  /** SCRIPT_VM, REJECT only: the source line the VM must stop at; a rejection anywhere else is a counterexample. */
  readonly rejectLine?: number | undefined;
  /** SYNTHETIC, REJECT only: the structural error code the refusal must carry. */
  readonly rejectCode?: string | undefined;
  /** Why (counted in the report), e.g. LEGITIMATE, NON_POSITIVE_DELTA, FORGED_SIGNATURE. */
  readonly reason?: string | undefined;
}

export type CovenantFuzzOutcome =
  | "PASS"
  | "COUNTEREXAMPLE"
  | "INFRASTRUCTURE_ERROR"
  | "NO_VM_EVIDENCE"
  | "EVALUATION_ERROR"
  | "INSUFFICIENT_COVERAGE";

/** What the main run evaluated (shrinking excluded), by the oracle's expectation and by the verdict observed. */
export interface CovenantFuzzCoverage {
  readonly samples: number;
  /** Of `samples`: the deterministic boundary samples, run first at every seed. */
  readonly boundarySamples: number;
  readonly expectedAccept: number;
  readonly expectedReject: number;
  readonly observedAccepted: number;
  readonly observedRejected: number;
  /** SCRIPT_VM: the VM's own verdict per sample (each one from a runner that actually ran). */
  readonly vmVerdicts: { readonly SCRIPT_VM_PASS: number; readonly SCRIPT_VM_REJECTED: number };
  /** SCRIPT_VM rejections by source line ("unresolved" when the runner gave none). */
  readonly rejectLines: Readonly<Record<string, number>>;
  /** SYNTHETIC rejections by structural error code. */
  readonly rejectCodes: Readonly<Record<string, number>>;
  readonly reasons: Readonly<Record<string, number>>;
  readonly minExpectedAccept: number;
  readonly minExpectedReject: number;
  /** Every evaluation, shrinking included. */
  readonly evaluations: number;
}

export interface CovenantFuzzInfrastructureFailure {
  /** A runner class (R-05), RUNNER_CHANGED, NO_VM_VERDICT or EVALUATION_ERROR. */
  readonly outcomeClass: string;
  readonly message: string;
  readonly runner?: SilverRunnerIdentity | undefined;
}

export interface BidirectionalCovenantFuzzOptions<TInput> extends CovenantFuzzRunOptions {
  /** Decides from the sample alone what must happen to it. */
  readonly oracle: (input: TInput) => CovenantFuzzOracleVerdict;
  /** Runs the sample (normally through the testbed) and returns its result. */
  readonly evaluate: (input: TInput) => Promise<CovenantTransitionResult>;
  /** Run first, at every seed, before the `numRuns` generated samples. */
  readonly boundarySamples?: readonly TInput[] | undefined;
  /** Minimum samples of each direction the main run must evaluate (default 1 each): fewer is INSUFFICIENT_COVERAGE. */
  readonly minExpectedAccept?: number | undefined;
  readonly minExpectedReject?: number | undefined;
  /** A sample in failure messages (default: its JSON). */
  readonly describe?: ((input: TInput) => string) | undefined;
}

export interface BidirectionalCovenantFuzzReport<TInput = unknown> extends CovenantFuzzReport<TInput> {
  readonly mode: "BIDIRECTIONAL";
  readonly outcome: CovenantFuzzOutcome;
  readonly coverage: CovenantFuzzCoverage;
  /** SCRIPT_VM: the runner every verdict came from (one runner per run), with its trust. */
  readonly runner: SilverRunnerIdentity | null;
  readonly infrastructureFailure?: CovenantFuzzInfrastructureFailure | undefined;
}

type CovenantFuzzObservation = "ACCEPTED" | "REJECTED" | "STRUCTURALLY_REFUSED";

/**
 * Runs a property in both directions (see the section comment). `numRuns` generated samples follow the boundary samples.
 * A sample the runner could not evaluate (BLOCKED: not found, unverified, did not start, timed out, protocol or internal
 * error), a SCRIPT_VM sample without the VM's verdict, a change of runner during the run, or a testbed exception stops
 * the run on that sample: nothing more is evaluated and the report names it — it is never a counterexample.
 */
export async function runBidirectionalCovenantFuzz<TInput>(
  arbitrary: fc.Arbitrary<TInput>,
  options: BidirectionalCovenantFuzzOptions<TInput>
): Promise<BidirectionalCovenantFuzzReport<TInput>> {
  const startMs = Date.now();
  const boundary = [...(options.boundarySamples ?? [])];
  const generatedRuns = options.numRuns ?? (options.backend === "SCRIPT_VM" ? 20 : 50);
  const seed = options.seed ?? 424242;
  const minExpectedAccept = options.minExpectedAccept ?? 1;
  const minExpectedReject = options.minExpectedReject ?? 1;
  const describe = options.describe ?? ((input: TInput) => JSON.stringify(serializeBigIntSafe(input)));
  const vmBackend = options.backend === "SCRIPT_VM";

  const counts = {
    samples: 0,
    boundarySamples: 0,
    expectedAccept: 0,
    expectedReject: 0,
    observedAccepted: 0,
    observedRejected: 0,
    vmPass: 0,
    vmRejected: 0,
    evaluations: 0
  };
  const rejectLines: Record<string, number> = {};
  const rejectCodes: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  const bump = (m: Record<string, number>, key: string) => (m[key] = (m[key] ?? 0) + 1);
  // mutated by the property while fast-check runs it (an object: TypeScript does not track closure assignments to lets)
  const run: {
    runner: SilverRunnerIdentity | null;
    stop?: CovenantFuzzInfrastructureFailure & { readonly kind: "INFRASTRUCTURE" | "NO_VM_EVIDENCE" | "EVALUATION_ERROR" };
    mainRunOver: boolean;
    mainRunIndex: number;
    firstFailingInput?: TInput;
  } = { runner: null, mainRunOver: false, mainRunIndex: 0 };

  const prop = fc.asyncProperty(arbitrary, async (sample) => {
    // after a stop nothing is evaluated again: fast-check's shrinking gets the same refusal at once
    if (run.stop) throw new Error(run.stop.message);
    const inMainRun = !run.mainRunOver;
    const isBoundary = inMainRun && run.mainRunIndex < boundary.length;
    if (inMainRun) run.mainRunIndex++;
    const fail = (message: string): never => {
      if (!run.mainRunOver) {
        run.mainRunOver = true;
        run.firstFailingInput = sample;
      }
      throw new Error(message);
    };
    const verdict = options.oracle(sample);
    const what = `${describe(sample)}${verdict.reason ? ` [${verdict.reason}]` : ""}`;
    counts.evaluations++;
    let r: CovenantTransitionResult;
    try {
      r = await options.evaluate(sample);
    } catch (e: any) {
      run.stop = { kind: "EVALUATION_ERROR", outcomeClass: "EVALUATION_ERROR", message: `EVALUATION_ERROR: ${what} could not be evaluated: ${e?.message ?? String(e)}` };
      return fail(run.stop.message);
    }
    const vm = r.vmResult;
    if (vmBackend) {
      if (r.status === "BLOCKED" || vm?.status === "BLOCKED") {
        const cls = vm?.outcomeClass ?? "RUNNER_NOT_FOUND";
        run.stop = {
          kind: "INFRASTRUCTURE",
          outcomeClass: cls,
          message: vm?.blockedReason ?? `${cls}: the SCRIPT_VM step did not run`,
          ...(vm?.runnerIdentity ? { runner: vm.runnerIdentity } : {})
        };
        return fail(run.stop.message);
      }
      if (!vm || (vm.outcomeClass !== "SCRIPT_VM_PASS" && vm.outcomeClass !== "SCRIPT_VM_REJECTED")) {
        run.stop = {
          kind: "NO_VM_EVIDENCE",
          outcomeClass: "NO_VM_VERDICT",
          message: `NO_VM_VERDICT: the VM gave no verdict for ${what} (status ${r.status}${r.structuralErrorCode ? `, ${r.structuralErrorCode}` : ""}): a SCRIPT_VM property cannot count it`
        };
        return fail(run.stop.message);
      }
      const identity = vm.runnerIdentity ?? null;
      const first = run.runner;
      if (first === null) {
        run.runner = identity;
      } else if (!identity || identity.sha256 !== first.sha256 || identity.path !== first.path) {
        run.stop = {
          kind: "INFRASTRUCTURE",
          outcomeClass: "RUNNER_CHANGED",
          message: `RUNNER_CHANGED: the runner changed during the run (${first.path} sha256 ${first.sha256}, then ${identity?.path ?? "none"} sha256 ${identity?.sha256 ?? "none"})`,
          ...(identity ? { runner: identity } : {})
        };
        return fail(run.stop.message);
      }
    }

    const line = r.diagnostic?.location?.line ?? vm?.diagnostic?.location?.line;
    const observed: CovenantFuzzObservation = vmBackend
      ? vm!.outcomeClass === "SCRIPT_VM_PASS"
        ? r.passed
          ? "ACCEPTED"
          : "STRUCTURALLY_REFUSED"
        : "REJECTED"
      : r.passed
        ? "ACCEPTED"
        : "REJECTED";
    if (inMainRun) {
      counts.samples++;
      if (isBoundary) counts.boundarySamples++;
      if (verdict.expected === "ACCEPT") counts.expectedAccept++;
      else counts.expectedReject++;
      if (observed === "ACCEPTED") counts.observedAccepted++;
      else counts.observedRejected++;
      if (vmBackend) {
        if (vm!.outcomeClass === "SCRIPT_VM_PASS") counts.vmPass++;
        else counts.vmRejected++;
      }
      if (verdict.reason) bump(reasons, verdict.reason);
      if (observed === "REJECTED") {
        if (vmBackend) bump(rejectLines, line === undefined ? "unresolved" : String(line));
        else bump(rejectCodes, r.structuralErrorCode ?? "unknown");
      }
    }

    const seen =
      observed === "ACCEPTED"
        ? "ACCEPTED"
        : observed === "STRUCTURALLY_REFUSED"
          ? `accepted by the VM but refused by the structural validation (${r.structuralErrorCode ?? r.status})`
          : vmBackend
            ? `REJECTED by the VM${line !== undefined ? ` at line ${line}` : ""} (${r.diagnostic?.message ?? vm?.diagnostic?.message ?? r.status})`
            : `REJECTED (${r.structuralErrorCode ?? r.status})`;
    if (verdict.expected === "ACCEPT" && observed !== "ACCEPTED") fail(`expected ACCEPT, observed ${seen}: ${what}`);
    if (verdict.expected === "REJECT") {
      if (observed === "ACCEPTED") fail(`expected REJECT, observed ACCEPTED: ${what}`);
      if (observed === "STRUCTURALLY_REFUSED") fail(`expected a SCRIPT_VM rejection, observed ${seen}: ${what}`);
      if (verdict.rejectLine !== undefined && line !== verdict.rejectLine) {
        fail(`expected REJECT at line ${verdict.rejectLine}, observed ${seen}: ${what}`);
      }
      if (verdict.rejectCode !== undefined && r.structuralErrorCode !== verdict.rejectCode) {
        fail(`expected REJECT with ${verdict.rejectCode}, observed ${seen}: ${what}`);
      }
    }
    return true;
  });

  const details = await fc.check(prop, {
    numRuns: boundary.length + generatedRuns,
    seed,
    examples: boundary.map((b) => [b] as [TInput]),
    ...(options.path ? { path: options.path } : {})
  });
  const durationMs = Date.now() - startMs;
  const coverage: CovenantFuzzCoverage = {
    samples: counts.samples,
    boundarySamples: counts.boundarySamples,
    expectedAccept: counts.expectedAccept,
    expectedReject: counts.expectedReject,
    observedAccepted: counts.observedAccepted,
    observedRejected: counts.observedRejected,
    vmVerdicts: { SCRIPT_VM_PASS: counts.vmPass, SCRIPT_VM_REJECTED: counts.vmRejected },
    rejectLines,
    rejectCodes,
    reasons,
    minExpectedAccept,
    minExpectedReject,
    evaluations: counts.evaluations
  };
  const targetCmd = options.testFile ? `pnpm vitest run ${options.testFile} --coverage=false` : `pnpm hardkas silver fuzz`;
  const base = {
    schema: "hardkas.covenant.fuzz.report.v1" as const,
    propertyName: options.propertyName,
    backend: options.backend,
    seed: details.seed,
    numRuns: details.numRuns,
    durationMs,
    mode: "BIDIRECTIONAL" as const,
    coverage,
    runner: run.runner
  };

  if (details.failed) {
    const counterexamplePath = details.counterexamplePath ?? "";
    const reproduceCommand = `${targetCmd} # seed=${details.seed} path="${counterexamplePath}"`;
    const firstFailingInput = run.firstFailingInput;
    const original = firstFailingInput !== undefined ? { originalInput: serializeBigIntSafe(firstFailingInput) as TInput } : {};
    if (run.stop) {
      const { kind, ...infrastructureFailure } = run.stop;
      return {
        ...base,
        passed: false,
        outcome: kind === "INFRASTRUCTURE" ? "INFRASTRUCTURE_ERROR" : kind,
        infrastructureFailure,
        failure: {
          kind,
          seed: details.seed,
          path: counterexamplePath,
          numRunsCompleted: details.numRuns,
          numShrinks: 0,
          ...original,
          ...(firstFailingInput !== undefined ? { shrunkCounterexample: serializeBigIntSafe(firstFailingInput) as TInput } : {}),
          backend: options.backend,
          error: run.stop.message,
          reproduceCommand
        }
      };
    }
    const shrunk = (details.counterexample?.[0] ?? firstFailingInput) as TInput;
    const rawErr = (details as any).errorInstance ?? (details as any).error;
    return {
      ...base,
      passed: false,
      outcome: "COUNTEREXAMPLE",
      failure: {
        kind: "COUNTEREXAMPLE",
        seed: details.seed,
        path: counterexamplePath,
        numRunsCompleted: details.numRuns,
        numShrinks: details.numShrinks ?? 0,
        ...original,
        shrunkCounterexample: serializeBigIntSafe(shrunk) as TInput,
        backend: options.backend,
        error: rawErr instanceof Error ? rawErr.message : String(rawErr ?? "Property failed"),
        reproduceCommand
      }
    };
  }

  const short: string[] = [];
  if (counts.expectedAccept < minExpectedAccept) short.push(`${counts.expectedAccept} ACCEPT sample(s) (minimum ${minExpectedAccept})`);
  if (counts.expectedReject < minExpectedReject) short.push(`${counts.expectedReject} REJECT sample(s) (minimum ${minExpectedReject})`);
  if (short.length > 0) {
    const verifier = vmBackend ? "VM" : "validation";
    const blind = counts.expectedAccept < minExpectedAccept ? "rejects" : "accepts";
    return {
      ...base,
      passed: false,
      outcome: "INSUFFICIENT_COVERAGE",
      failure: {
        kind: "INSUFFICIENT_COVERAGE",
        seed: details.seed,
        path: "",
        numRunsCompleted: details.numRuns,
        numShrinks: 0,
        backend: options.backend,
        error: `INSUFFICIENT_COVERAGE: the run evaluated ${short.join(" and ")}; a property exercised in one direction cannot tell a correct ${verifier} from one that ${blind} everything`,
        reproduceCommand: `${targetCmd} # seed=${details.seed}`
      }
    };
  }
  return { ...base, passed: true, outcome: "PASS" };
}

// ── Counter covenants (OwnedCounter, GuardedVaultCounter, …) ─────────────────

/** SilverScript `int` as a script number: 8 bytes, sign and magnitude, so the range is symmetric (−2^63 does not encode). */
export const SILVER_INT_MAX = 2n ** 63n - 1n;
export const SILVER_INT_MIN = -(2n ** 63n - 1n);

/** What a test needs from a testbed (createCovenantTestbed's result). */
export type CovenantFuzzTestbed = Pick<ReturnType<typeof createCovenantTestbed>, "deployGenesis" | "executeTransition" | "getAccount">;

export type CounterTransitionCase = "LEGITIMATE" | "NON_POSITIVE_DELTA" | "STATE_MISMATCH" | "OVERFLOW";

export interface CounterTransitionSample {
  readonly initialCount: bigint;
  readonly delta: bigint;
  readonly successorCount: bigint;
  /** The generator's label; the oracle recomputes it from the counter rule and never trusts it. */
  readonly isLegitimate: boolean;
  readonly case: CounterTransitionCase;
}

/**
 * Counter transitions in three equally likely strata — legitimate (delta > 0, successor = previous + delta), a
 * non-positive delta, a successor off by a non-zero perturbation — so both directions are drawn at any seed.
 */
export function counterTransitionArbitrary(options?: {
  readonly maxInitial?: bigint;
  readonly maxDelta?: bigint;
  readonly maxPerturbation?: bigint;
}): fc.Arbitrary<CounterTransitionSample> {
  const maxInitial = options?.maxInitial ?? 1_000_000n;
  const maxDelta = options?.maxDelta ?? 500_000n;
  const maxPerturbation = options?.maxPerturbation ?? 100_000n;
  const initialCount = fc.bigInt({ min: 0n, max: maxInitial });
  const legitimate = fc
    .record({ initialCount, delta: fc.bigInt({ min: 1n, max: maxDelta }) })
    .map(({ initialCount: i, delta }) => ({ initialCount: i, delta, successorCount: i + delta, isLegitimate: true, case: "LEGITIMATE" as const }));
  const nonPositive = fc
    .record({ initialCount, delta: fc.bigInt({ min: -maxDelta, max: 0n }) })
    .map(({ initialCount: i, delta }) => ({ initialCount: i, delta, successorCount: i + delta, isLegitimate: false, case: "NON_POSITIVE_DELTA" as const }));
  const mismatch = fc
    .record({
      initialCount,
      delta: fc.bigInt({ min: 1n, max: maxDelta }),
      perturbation: fc.oneof(fc.bigInt({ min: -maxPerturbation, max: -1n }), fc.bigInt({ min: 1n, max: maxPerturbation }))
    })
    .map(({ initialCount: i, delta, perturbation }) => ({
      initialCount: i,
      delta,
      successorCount: i + delta + perturbation,
      isLegitimate: false,
      case: "STATE_MISMATCH" as const
    }));
  return fc.oneof(legitimate, nonPositive, mismatch);
}

/**
 * The edges of a counter transition, run first at every seed: the smallest increment, delta 0 and −1, a successor one
 * above and one below, the largest successor and the largest increment, an increment past the int range (the VM refuses
 * it: "Number too big"), a value across the JSON safe-integer edge of the runner's input, and a negative state.
 */
export function counterTransitionBoundarySamples(): CounterTransitionSample[] {
  const s = (initialCount: bigint, delta: bigint, successorCount: bigint, kind: CounterTransitionCase): CounterTransitionSample => ({
    initialCount,
    delta,
    successorCount,
    isLegitimate: kind === "LEGITIMATE",
    case: kind
  });
  return [
    s(0n, 1n, 1n, "LEGITIMATE"),
    s(0n, 0n, 0n, "NON_POSITIVE_DELTA"),
    s(10n, -1n, 9n, "NON_POSITIVE_DELTA"),
    s(10n, 1n, 12n, "STATE_MISMATCH"),
    s(10n, 1n, 10n, "STATE_MISMATCH"),
    s(SILVER_INT_MAX - 1n, 1n, SILVER_INT_MAX, "LEGITIMATE"),
    s(0n, SILVER_INT_MAX, SILVER_INT_MAX, "LEGITIMATE"),
    s(SILVER_INT_MAX, 1n, SILVER_INT_MAX, "OVERFLOW"),
    s(2n ** 53n - 1n, 1n, 2n ** 53n, "LEGITIMATE"),
    s(-5n, 1n, -4n, "LEGITIMATE")
  ];
}

/**
 * The counter rule as an oracle: accepted iff delta > 0 and successor = previous + delta within the int range. Computed
 * from the values, never from the sample's label. `deltaCheckLine`: the line of the contract's `require(delta > 0)`.
 */
export function counterTransitionOracle(
  sample: CounterTransitionSample,
  options: { readonly deltaCheckLine?: number | undefined } = {}
): CovenantFuzzOracleVerdict {
  const sum = sample.initialCount + sample.delta;
  if (sample.delta > 0n && sum <= SILVER_INT_MAX && sum === sample.successorCount) return { expected: "ACCEPT", reason: "LEGITIMATE" };
  if (sample.delta <= 0n) {
    return { expected: "REJECT", reason: "NON_POSITIVE_DELTA", ...(options.deltaCheckLine !== undefined ? { rejectLine: options.deltaCheckLine } : {}) };
  }
  if (sum > SILVER_INT_MAX) return { expected: "REJECT", reason: "OVERFLOW" };
  return { expected: "REJECT", reason: "STATE_MISMATCH" };
}

interface CounterFuzzCommonOptions {
  readonly entrypoint?: string | undefined;
  /** The counter's state field (default "value"). */
  readonly stateField?: string | undefined;
  /** The testbed account that is authorized to sign (default "owner"). */
  readonly signer?: string | undefined;
  readonly feeSompi?: bigint | undefined;
  readonly numRuns?: number | undefined;
  readonly seed?: number | undefined;
  readonly path?: string | undefined;
  readonly testFile?: string | undefined;
  readonly propertyName?: string | undefined;
  readonly minExpectedAccept?: number | undefined;
  readonly minExpectedReject?: number | undefined;
}

/**
 * SCRIPT_VM, bidirectional: a counter transition passes the VM iff the counter rule allows it. Every sample gets a fresh
 * covenant whose state is the sample's own (never a UTXO an earlier sample spent).
 */
export async function fuzzCounterTransitions(
  testbed: CovenantFuzzTestbed,
  contract: CompiledCovenantContract,
  options: CounterFuzzCommonOptions & {
    readonly deltaCheckLine?: number | undefined;
    readonly boundaries?: boolean | undefined;
    readonly arbitrary?: fc.Arbitrary<CounterTransitionSample> | undefined;
  } = {}
): Promise<BidirectionalCovenantFuzzReport<CounterTransitionSample>> {
  const entrypoint = options.entrypoint ?? "bump";
  const field = options.stateField ?? "value";
  const signer = options.signer ?? "owner";
  return runBidirectionalCovenantFuzz(options.arbitrary ?? counterTransitionArbitrary(), {
    propertyName: options.propertyName ?? `${contract.contractName}.${entrypoint}-counter-transition-bi-implication`,
    backend: "SCRIPT_VM",
    numRuns: options.numRuns ?? 20,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.path !== undefined ? { path: options.path } : {}),
    ...(options.testFile !== undefined ? { testFile: options.testFile } : {}),
    boundarySamples: options.boundaries === false ? [] : counterTransitionBoundarySamples(),
    minExpectedAccept: options.minExpectedAccept ?? 3,
    minExpectedReject: options.minExpectedReject ?? 3,
    oracle: (s) => counterTransitionOracle(s, { deltaCheckLine: options.deltaCheckLine }),
    describe: (s) => `${field} ${s.initialCount} -> ${s.successorCount} (delta ${s.delta})`,
    evaluate: async (s) => {
      const genesis = await testbed.deployGenesis({ contract, initialState: { [field]: s.initialCount } });
      return testbed.executeTransition({
        contract,
        utxo: genesis.utxo,
        entrypoint,
        args: [
          { kind: "int", value: s.delta },
          { kind: "signer", signer }
        ],
        nextStates: [{ state: { [field]: s.successorCount } }],
        ...(options.feeSompi !== undefined ? { feeSompi: options.feeSompi } : {}),
        backends: ["SYNTHETIC", "SCRIPT_VM"]
      });
    }
  });
}

export type CounterAuthorizationCase = "AUTHORIZED_SIGNATURE" | "FORGED_SIGNATURE" | "WRONG_KEY_SIGNATURE";

export interface CounterAuthorizationSample {
  readonly case: CounterAuthorizationCase;
  readonly delta: bigint;
  /** FORGED_SIGNATURE: the 65 bytes (64-byte signature || sighash type) given as the signature. */
  readonly forgedSignatureHex?: string | undefined;
  /** WRONG_KEY_SIGNATURE: the testbed account whose key signs instead of the authorized one. */
  readonly wrongSigner?: string | undefined;
}

/** Testbed accounts that are never the authorized signer "owner". */
export const COUNTER_UNAUTHORIZED_SIGNERS = ["mallory", "alice", "bob", "funder"] as const;

/** The authorized signature, forged signature bytes, and a real signature by the wrong key, equally likely. */
export function counterAuthorizationArbitrary(): fc.Arbitrary<CounterAuthorizationSample> {
  const delta = fc.bigInt({ min: 1n, max: 1_000n });
  return fc.oneof(
    delta.map((d) => ({ case: "AUTHORIZED_SIGNATURE" as const, delta: d })),
    fc
      .record({ delta, sig: invalidSignatureHexArbitrary() })
      .map(({ delta: d, sig }) => ({ case: "FORGED_SIGNATURE" as const, delta: d, forgedSignatureHex: sig })),
    fc
      .record({ delta, signer: fc.constantFrom(...COUNTER_UNAUTHORIZED_SIGNERS) })
      .map(({ delta: d, signer }) => ({ case: "WRONG_KEY_SIGNATURE" as const, delta: d, wrongSigner: signer }))
  );
}

/** The edges of the signature check: the authorized key, an all-zero signature, ANYONECANPAY bytes, another real key. */
export function counterAuthorizationBoundarySamples(): CounterAuthorizationSample[] {
  return [
    { case: "AUTHORIZED_SIGNATURE", delta: 1n },
    { case: "FORGED_SIGNATURE", delta: 1n, forgedSignatureHex: `${"00".repeat(64)}01` },
    { case: "FORGED_SIGNATURE", delta: 1n, forgedSignatureHex: `${"42".repeat(64)}81` },
    { case: "WRONG_KEY_SIGNATURE", delta: 1n, wrongSigner: "mallory" }
  ];
}

/**
 * SCRIPT_VM, bidirectional: a counter transition passes the VM iff the authorized key signed it. Every sample gets a
 * fresh covenant (state 10). `sigCheckLine`: the line of the contract's `require(checkSig(…))`.
 */
export async function fuzzCounterAuthorization(
  testbed: CovenantFuzzTestbed,
  contract: CompiledCovenantContract,
  options: CounterFuzzCommonOptions & { readonly sigCheckLine?: number | undefined } = {}
): Promise<BidirectionalCovenantFuzzReport<CounterAuthorizationSample>> {
  const entrypoint = options.entrypoint ?? "bump";
  const field = options.stateField ?? "value";
  const signer = options.signer ?? "owner";
  return runBidirectionalCovenantFuzz(counterAuthorizationArbitrary(), {
    propertyName: options.propertyName ?? `${contract.contractName}.${entrypoint}-authorization-bi-implication`,
    backend: "SCRIPT_VM",
    numRuns: options.numRuns ?? 12,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.path !== undefined ? { path: options.path } : {}),
    ...(options.testFile !== undefined ? { testFile: options.testFile } : {}),
    boundarySamples: counterAuthorizationBoundarySamples(),
    minExpectedAccept: options.minExpectedAccept ?? 1,
    minExpectedReject: options.minExpectedReject ?? 3,
    oracle: (s) =>
      s.case === "AUTHORIZED_SIGNATURE"
        ? { expected: "ACCEPT", reason: s.case }
        : { expected: "REJECT", reason: s.case, ...(options.sigCheckLine !== undefined ? { rejectLine: options.sigCheckLine } : {}) },
    describe: (s) =>
      s.case === "FORGED_SIGNATURE"
        ? `forged signature ${s.forgedSignatureHex?.slice(0, 16)}…${s.forgedSignatureHex?.slice(-2)} (delta ${s.delta})`
        : s.case === "WRONG_KEY_SIGNATURE"
          ? `signature by ${s.wrongSigner} (delta ${s.delta})`
          : `signature by ${signer} (delta ${s.delta})`,
    evaluate: async (s) => {
      const genesis = await testbed.deployGenesis({ contract, initialState: { [field]: 10n } });
      const sig =
        s.case === "FORGED_SIGNATURE"
          ? { kind: "bytes" as const, value: [...Buffer.from(s.forgedSignatureHex ?? "", "hex")] }
          : s.case === "WRONG_KEY_SIGNATURE"
            ? { kind: "signer" as const, signer, overridePrivateKeyHex: testbed.getAccount(s.wrongSigner ?? "mallory").privateKeyHex }
            : { kind: "signer" as const, signer };
      return testbed.executeTransition({
        contract,
        utxo: genesis.utxo,
        entrypoint,
        args: [{ kind: "int", value: s.delta }, sig],
        nextStates: [{ state: { [field]: 10n + s.delta } }],
        ...(options.feeSompi !== undefined ? { feeSompi: options.feeSompi } : {}),
        // forged bytes cannot be signed by the structural builder: the VM alone judges them
        backends: s.case === "FORGED_SIGNATURE" ? ["SCRIPT_VM"] : ["SYNTHETIC", "SCRIPT_VM"]
      });
    }
  });
}

export type ComputeBudgetCase = "WITHIN_BOUNDS" | "NON_POSITIVE" | "NON_INTEGER" | "BELOW_ESTIMATE" | "ABOVE_MASS_LIMIT" | "ABOVE_U16";

export interface ComputeBudgetSample {
  readonly computeBudget: number;
  readonly case: ComputeBudgetCase;
}

/**
 * SYNTHETIC, bidirectional: the structural validation accepts a legitimate counter transition whose compute budget is
 * within bounds (from the script's estimate to a few units above it, with a fee that covers the floor) and refuses one
 * whose budget is not a positive integer, is below the estimate, exceeds u16 or pushes the mass past the standard
 * limit — each with its own code. The estimate is read from the testbed first (a dry run that must itself pass).
 */
export async function fuzzComputeBudgetBounds(
  testbed: CovenantFuzzTestbed,
  contract: CompiledCovenantContract,
  options: CounterFuzzCommonOptions & { readonly acceptSpan?: number | undefined } = {}
): Promise<BidirectionalCovenantFuzzReport<ComputeBudgetSample>> {
  const entrypoint = options.entrypoint ?? "bump";
  const field = options.stateField ?? "value";
  const signer = options.signer ?? "owner";
  const feeSompi = options.feeSompi ?? 1_000_000n;
  const transition = async (computeBudget: number | "estimate") => {
    const genesis = await testbed.deployGenesis({ contract, initialState: { [field]: 10n } });
    return testbed.executeTransition({
      contract,
      utxo: genesis.utxo,
      entrypoint,
      args: [
        { kind: "int", value: 1n },
        { kind: "signer", signer }
      ],
      nextStates: [{ state: { [field]: 11n } }],
      feeSompi,
      computeBudget,
      backends: ["SYNTHETIC"]
    });
  };
  const dry = await transition("estimate");
  const estimate = dry.computeBudgetEstimate?.budget;
  if (!dry.passed || estimate === undefined || !Number.isInteger(estimate) || estimate < 1) {
    throw new Error(
      `COMPUTE_BUDGET_ESTIMATE_UNAVAILABLE: the dry run with the estimated budget did not pass (${dry.structuralErrorCode ?? dry.status}): no bounds to fuzz`
    );
  }
  const span = Math.max(1, options.acceptSpan ?? 4);
  const arbitrary: fc.Arbitrary<ComputeBudgetSample> = fc.oneof(
    fc.integer({ min: estimate, max: estimate + span }).map((b) => ({ computeBudget: b, case: "WITHIN_BOUNDS" as const })),
    fc.integer({ min: -10_000, max: 0 }).map((b) => ({ computeBudget: b, case: "NON_POSITIVE" as const })),
    ...(estimate > 1 ? [fc.integer({ min: 1, max: estimate - 1 }).map((b) => ({ computeBudget: b, case: "BELOW_ESTIMATE" as const }))] : []),
    fc.integer({ min: 65_536, max: 65_535 * 5 }).map((b) => ({ computeBudget: b, case: "ABOVE_U16" as const }))
  );
  const codeOf: Record<ComputeBudgetCase, string | undefined> = {
    WITHIN_BOUNDS: undefined,
    NON_POSITIVE: "COMPUTE_BUDGET_NON_POSITIVE",
    NON_INTEGER: "COMPUTE_BUDGET_NON_POSITIVE",
    BELOW_ESTIMATE: "COMPUTE_BUDGET_INSUFFICIENT",
    ABOVE_MASS_LIMIT: "TX_MASS_ABOVE_STANDARD_LIMIT",
    ABOVE_U16: "COMPUTE_BUDGET_EXCEEDED"
  };
  const boundary: ComputeBudgetSample[] = [
    { computeBudget: estimate, case: "WITHIN_BOUNDS" },
    { computeBudget: estimate + 1, case: "WITHIN_BOUNDS" },
    { computeBudget: 0, case: "NON_POSITIVE" },
    { computeBudget: 1.5, case: "NON_INTEGER" },
    ...(estimate > 1 ? [{ computeBudget: 1, case: "BELOW_ESTIMATE" as const }, { computeBudget: estimate - 1, case: "BELOW_ESTIMATE" as const }] : []),
    { computeBudget: 65_535, case: "ABOVE_MASS_LIMIT" },
    { computeBudget: 65_536, case: "ABOVE_U16" }
  ];
  return runBidirectionalCovenantFuzz(arbitrary, {
    propertyName: options.propertyName ?? `${contract.contractName}.${entrypoint}-compute-budget-bounds`,
    backend: "SYNTHETIC",
    numRuns: options.numRuns ?? 40,
    ...(options.seed !== undefined ? { seed: options.seed } : {}),
    ...(options.path !== undefined ? { path: options.path } : {}),
    ...(options.testFile !== undefined ? { testFile: options.testFile } : {}),
    boundarySamples: boundary,
    minExpectedAccept: options.minExpectedAccept ?? 2,
    minExpectedReject: options.minExpectedReject ?? 3,
    oracle: (s) =>
      s.case === "WITHIN_BOUNDS"
        ? { expected: "ACCEPT", reason: s.case }
        : { expected: "REJECT", reason: s.case, rejectCode: codeOf[s.case] },
    describe: (s) => `computeBudget ${s.computeBudget} (estimate ${estimate})`,
    evaluate: (s) => transition(s.computeBudget)
  });
}
