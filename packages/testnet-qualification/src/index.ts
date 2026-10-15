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
  RemoteTestnetProbeFailedError,
  canonicalEndpoint,
  shownEndpoint
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

export { waitForAcceptance } from "./daa-observer.js";
export type {
  AcceptanceEvidence,
  DaaObserverRpc,
  DaaObserverUtxoRow,
  WaitForAcceptanceInput,
  WaitForAcceptanceOptions
} from "./daa-observer.js";

export { observeChainAcceptance, CHAIN_OBSERVATION_LIMITATIONS } from "./chain-acceptance.js";
export type {
  ChainStartPoint,
  ChainLookFinding,
  ChainLook,
  ChainAcceptanceObserver,
  UtxoBinding,
  ChainAcceptanceEvidence,
  BlueConfirmationEvidence,
  ChainAcceptanceResult,
  ObserveChainAcceptanceInput,
  ObserveChainAcceptanceOptions
} from "./chain-acceptance.js";

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

export {
  submitWithAmbiguityGuard,
  attemptOutcomeOf,
  PRE_SEND_REFUSAL_CODES,
  SubmissionNotAttemptedError
} from "./submission-guard.js";
export type {
  SubmissionState,
  SubmissionResolvedVia,
  SubmissionAttemptOutcome,
  SubmissionOutcome,
  SubmissionGuardRpc,
  SubmissionGuardInput,
  SubmissionGuardOptions
} from "./submission-guard.js";

export {
  RAW_RECEIPT_SCHEMA,
  RAW_RECEIPT_SCHEMA_VERSION,
  RAW_RECEIPT_READABLE_VERSIONS,
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
  ReceiptSubmissionAttempt,
  ReceiptAcceptanceEvidence,
  ReceiptInclusionEvidence,
  ReceiptConfirmationEvidence,
  ReceiptChainStartPoint,
  ReceiptChainLook,
  ReceiptChainAcceptanceEvidence,
  ReceiptBlueConfirmationEvidence
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
