// SAFETY_LEVEL: SIMULATION_ONLY
//
// @hardkas/testing — Semantic Test Framework for HardKAS.

// ── Test Harness ─────────────────────────────────────────────────────────────
export type { HarnessConfig, TestHarness, SendResult } from "./harness.js";
export {
  createTestHarness,
  enableMassTracking,
  disableMassTracking,
  getMassRecords,
  clearMassRecords
} from "./harness.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────
export type { FixtureDefinition } from "./fixtures.js";
export { createFixture } from "./fixtures.js";

// ── Matchers ─────────────────────────────────────────────────────────────────
export type { HardKasMatchers, CovenantPassMatcherOptions } from "./matchers.js";

// ── Covenant Dev Framework (Testing, VM Preflight, Fuzzing, Isolated Simnet) ──
export type {
  CovenantEvidenceLevel,
  CovenantPreflightLevel,
  CovenantTestAccount,
  CompiledCovenantContract,
  CovenantLiveUtxo,
  CovenantUtxoFixture,
  CovenantTransitionAttemptParams,
  CovenantTransitionResult,
  CovenantTestbedOptions
} from "./covenant-testbed.js";
export { createCovenantTestbed, normalizeStateRecord } from "./covenant-testbed.js";

export type {
  ConsensusSubmissionStage,
  ConsensusSubmissionOutcome,
  ConsensusSimnetRpc,
  ConsensusObservationOptions,
  ConsensusExpectedOutput,
  ConsensusSpentInput,
  ConsensusSubmissionEvidence
} from "./consensus-submission.js";
export { submitAndObserveConsensus } from "./consensus-submission.js";

export type {
  CovenantTopologyKind,
  CovenantTopologySample,
  CovenantFuzzRunOptions,
  CovenantFuzzFailureReport,
  CovenantFuzzReport,
  CovenantFuzzExpectation,
  CovenantFuzzOracleVerdict,
  CovenantFuzzOutcome,
  CovenantFuzzCoverage,
  CovenantFuzzInfrastructureFailure,
  BidirectionalCovenantFuzzOptions,
  BidirectionalCovenantFuzzReport,
  CovenantFuzzTestbed,
  CounterTransitionCase,
  CounterTransitionSample,
  CounterAuthorizationCase,
  CounterAuthorizationSample,
  ComputeBudgetCase,
  ComputeBudgetSample
} from "./covenant-fuzz.js";
export {
  MAX_SOMPI,
  MIN_NON_DUST_SOMPI,
  SILVER_INT_MAX,
  SILVER_INT_MIN,
  COUNTER_UNAUTHORIZED_SIGNERS,
  sompiAmountArbitrary,
  covenantIdHexArbitrary,
  corruptedCovenantIdArbitrary,
  covenantUtxoArbitrary,
  int64StateArbitrary,
  successorStateTransitionArbitrary,
  invalidSignatureHexArbitrary,
  unauthorizedFixtureSignerArbitrary,
  computeBudgetArbitrary,
  invalidComputeBudgetArbitrary,
  covenantTopologyArbitrary,
  runCovenantPropertyFuzz,
  runBidirectionalCovenantFuzz,
  counterTransitionArbitrary,
  counterTransitionBoundarySamples,
  counterTransitionOracle,
  fuzzCounterTransitions,
  counterAuthorizationArbitrary,
  counterAuthorizationBoundarySamples,
  fuzzCounterAuthorization,
  fuzzComputeBudgetBounds
} from "./covenant-fuzz.js";

export type {
  IsolatedSimnetSession,
  StartIsolatedSimnetOptions,
  SimnetOnChainUtxo,
  CoinbaseMaturityAuditResult,
  SimnetCovenantTransitionInput,
  SimnetCovenantTransitionOutcome
} from "./isolated-simnet.js";
export {
  SIMNET_CONSENSUS_COINBASE_MATURITY_DAA,
  startIsolatedSimnet,
  stopIsolatedSimnet,
  mineBlocks,
  waitForDaaScore,
  waitForUtxo,
  waitForTransaction,
  fundTestAccount,
  inspectCoinbaseMaturity,
  createFundedCovenant,
  createFundedP2sh,
  executeSimnetCovenantTransition,
  testbedSimnetRpc
} from "./isolated-simnet.js";

// ── Signers ──────────────────────────────────────────────────────────────────
export {
  HardkasFixtureSigner,
  HARDKAS_FIXTURE_DERIVATION_DOMAIN,
  HARDKAS_FIXTURE_NAMES,
  HARDKAS_FIXTURE_REGISTRY,
  getHardkasFixtureKey
} from "./fixture-signer.js";
export type { HardkasFixtureName } from "./fixture-signer.js";
export { SimulatedTxPlanSigner } from "./simulated-tx-plan-signer.js";
export { hardKasMatchers } from "./matchers.js";

// ── Setup (side-effect import) ──────────────────────────────────────────────
// Avoid auto-importing setup.js in index.ts because it pulls in vitest and causes
// "Vitest failed to access its internal state" when executed by the CLI in non-test runs.
// Test runners should import "@hardkas/testing/setup" explicitly instead.

// ── Reproducibility Proof ───────────────────────────────────────────────────
export type { ReproducibilityReport } from "./reproducibility.js";
export { generateReproducibilityReport } from "./reproducibility.js";

// ── Adversarial Validation ──────────────────────────────────────────────────
export { AdversarialFixtures } from "./adversarial-fixtures.js";

// ── Scenarios ────────────────────────────────────────────────────────────────
// Test scenarios are exported from "@hardkas/testing/scenarios" to avoid loading vitest in non-test contexts.

// ── Torture Suite ────────────────────────────────────────────────────────────
export type {
  TortureCaseResult,
  TortureBucketContext,
  TortureBucket
} from "./torture/torture-engine.js";
export {
  LcgPrng,
  getAllTortureBuckets,
  getTortureBucket,
  TortureInvariantError
} from "./torture/torture-engine.js";
import "./torture/buckets.js";
import "./torture/local-buckets.js";
import "./torture/corruption-buckets.js";
