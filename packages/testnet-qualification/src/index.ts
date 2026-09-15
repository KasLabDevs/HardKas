/**
 * @hardkas/testnet-qualification — TQ-1 façade.
 *
 * Internal package. NOT published; production packages MUST NOT depend on
 * this package. Consumed by:
 *   - `scripts/testnet-qualification.mjs` (CLI entrypoint, arriving in a
 *     later block)
 *   - Its own unit tests.
 *
 * See `scratchpad/m9/10-TQ-1-per-package-plan.md` for the full plan.
 */

export {
  classifyError,
  withRetryOnTransport,
  RemoteTestnetProbeFailedErrorMarker
} from "./retry.js";
export type { RetryErrorClass, WithRetryOnTransportOptions } from "./retry.js";

export {
  probeRemoteTestnet,
  assertRemoteTestnetOrFailClosed,
  RemoteTestnetProbeFailedError
} from "./remote-node.js";
export type {
  EndpointClass,
  EndpointDescriptor,
  GetServerInfoResponse,
  GetBlockDagInfoResponse,
  RemoteNodeRpc,
  CapabilityName,
  RemoteTestnetAuthority,
  ProbeFailureReason,
  ProbeRemoteTestnetInput
} from "./remote-node.js";

export {
  waitForAcceptance,
  observeInclusion,
  assertConfirmedByDaaDelta
} from "./daa-observer.js";
export type {
  AcceptanceEvidence,
  InclusionEvidence,
  ConfirmationEvidence,
  DaaObserverRpc,
  DaaObserverUtxoRow,
  WaitForAcceptanceInput,
  WaitForAcceptanceOptions,
  ObserveInclusionInput,
  AssertConfirmedByDaaDeltaOptions
} from "./daa-observer.js";

export {
  assertSpendableOrFailClosed,
  createInMemoryReservationLedger,
  FundingInputRejectedError
} from "./funding-input.js";
export type {
  DeclaredFundingOutpoint,
  FundingAuthority,
  FundingMaturityContext,
  FundingInputSpec,
  FundingInputRpc,
  LocalReservationLedger,
  SourceUtxoEvidence,
  FundingInputFailureReason,
  AssertSpendableInput
} from "./funding-input.js";

export { submitWithAmbiguityGuard } from "./submission-guard.js";
export type {
  SubmissionState,
  SubmissionResolvedVia,
  SubmissionOutcome,
  SubmissionGuardRpc,
  SubmissionGuardInput,
  SubmissionGuardOptions
} from "./submission-guard.js";

export {
  RAW_RECEIPT_SCHEMA,
  RAW_RECEIPT_SCHEMA_VERSION,
  ReceiptPersistenceError,
  canonicalizeReceipt,
  toReceiptJsonSafe,
  sanitizeNetworkForFs,
  formatUtcTimestampForFilename,
  receiptFilename,
  persistRawReceipt,
  readRawReceipt
} from "./receipt.js";
export type {
  QualificationOutcome,
  QualificationToolchainIdentity,
  QualificationArtifactReference,
  QualificationEvidence,
  TestnetQualificationReceipt,
  PersistRawReceiptInput,
  PersistedRawReceipt,
  ReadRawReceiptResult,
  ReceiptPersistenceReason,
  ReceiptRemoteAuthority,
  ReceiptSourceUtxoEvidence,
  ReceiptSubmissionOutcome,
  ReceiptAcceptanceEvidence,
  ReceiptInclusionEvidence,
  ReceiptConfirmationEvidence
} from "./receipt.js";

export {
  SHARED_RECEIPT_SCHEMA,
  SHARED_RECEIPT_SCHEMA_VERSION,
  deriveSharedReceipt,
  canonicalizeSharedReceipt,
  persistSharedReceipt,
  sharedReceiptFilename,
  verifySharedAgainstRaw
} from "./receipt-redactor.js";

export { runStandardL1Scenario } from "./scenarios/standard-l1.js";
export type {
  ProductTransactionPath,
  PlanAndSignInput,
  PlanAndSignResult,
  ScenarioBlockerStage,
  ScenarioBlocker,
  StandardL1ScenarioInput,
  StandardL1ScenarioResult
} from "./scenarios/standard-l1.js";

export { runQualification } from "./runner.js";
export type {
  StandardL1RunnerBinding,
  RunnerInput,
  RunnerOutcome,
  RunnerEvidencePersistence,
  EvidencePersistenceState
} from "./runner.js";
export type {
  DerivedFromPointer,
  SharedRemoteAuthority,
  SharedSourceUtxoEvidence,
  SharedSubmissionOutcome,
  SharedEvidence,
  SharedQualificationReceipt,
  DeriveSharedInput,
  DerivedShared,
  PersistSharedInput,
  PersistedShared,
  VerifySharedResult
} from "./receipt-redactor.js";
