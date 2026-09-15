/**
 * TQ-1 Block 4 — Runner.
 *
 * Orchestrates the TQ pipeline for one qualification execution:
 *
 *   probe → funding (already validated) → scenario(s) → build raw receipt
 *          → persist raw → derive shared → persist shared
 *
 * Rules (agreed 2026-09-15):
 *
 * - Qualification outcome (`PASS | FAIL | UNRESOLVED`) and evidence
 *   persistence outcome are TWO INDEPENDENT DIMENSIONS. A failed raw
 *   persistence never mutates the qualification outcome, and a
 *   successfully persisted raw is not "invalid" merely because the
 *   shared derivation failed.
 *
 * - The runner performs ZERO product-layer transaction work of its own.
 *   Scenarios call caller-supplied `ProductTransactionPath` bindings.
 *
 * - The runner NEVER re-runs a scenario merely because raw persistence
 *   failed. A live transaction is a side effect; recreating evidence
 *   never justifies repeating a broadcast.
 */

import type {
  QualificationOutcome,
  QualificationToolchainIdentity,
  ReceiptRemoteAuthority,
  ReceiptSourceUtxoEvidence,
  ReceiptSubmissionOutcome,
  ReceiptAcceptanceEvidence,
  ReceiptInclusionEvidence,
  ReceiptConfirmationEvidence,
  TestnetQualificationReceipt,
  PersistedRawReceipt
} from "./receipt.js";
import {
  RAW_RECEIPT_SCHEMA,
  RAW_RECEIPT_SCHEMA_VERSION,
  persistRawReceipt
} from "./receipt.js";
import {
  deriveSharedReceipt,
  persistSharedReceipt,
  type SharedQualificationReceipt,
  type PersistedShared
} from "./receipt-redactor.js";
import type { RemoteTestnetAuthority } from "./remote-node.js";
import type { SourceUtxoEvidence } from "./funding-input.js";
import type { SubmissionOutcome } from "./submission-guard.js";
import type {
  AcceptanceEvidence,
  InclusionEvidence,
  ConfirmationEvidence
} from "./daa-observer.js";
import {
  runStandardL1Scenario,
  type ProductTransactionPath,
  type StandardL1ScenarioInput,
  type StandardL1ScenarioResult,
  type ScenarioBlocker
} from "./scenarios/standard-l1.js";
import type { SubmissionGuardRpc } from "./submission-guard.js";
import type { DaaObserverRpc } from "./daa-observer.js";

export interface StandardL1RunnerBinding {
  readonly productPath: ProductTransactionPath;
  readonly submissionRpc: SubmissionGuardRpc;
  readonly observerRpc: DaaObserverRpc;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly amountSompi: bigint;
  readonly configuredDaaDelta: bigint;
  readonly submissionOptions?: StandardL1ScenarioInput["submissionOptions"];
  readonly acceptanceOptions?: StandardL1ScenarioInput["acceptanceOptions"];
  readonly confirmationOptions?: StandardL1ScenarioInput["confirmationOptions"];
}

export interface RunnerInput {
  readonly qualificationId: string;
  readonly toolchain: QualificationToolchainIdentity;
  readonly authority: RemoteTestnetAuthority;
  readonly fundingEvidence: SourceUtxoEvidence;
  readonly rawDir: string;
  /** Set to `undefined` to skip shared derivation/persistence entirely. */
  readonly sharedDir?: string;
  readonly standardL1?: StandardL1RunnerBinding;
  readonly startedAt: Date;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
}

export type EvidencePersistenceState = "persisted" | "failed" | "not-attempted";

export interface RunnerEvidencePersistence {
  readonly raw: EvidencePersistenceState;
  readonly rawFilePath?: string;
  readonly rawDigest?: string;
  readonly shared: EvidencePersistenceState;
  readonly sharedFilePath?: string;
  readonly sharedDigest?: string;
  /** Persistence errors, if any. Each entry is the surfaced error message. */
  readonly errors?: readonly {
    readonly stage: "raw" | "shared";
    readonly code?: string;
    readonly message: string;
  }[];
}

export interface RunnerOutcome {
  readonly qualification: {
    readonly outcome: QualificationOutcome;
    readonly blocker?: ScenarioBlocker;
  };
  readonly scenarios: {
    readonly standardL1?: StandardL1ScenarioResult;
  };
  readonly evidencePersistence: RunnerEvidencePersistence;
  /** Built raw receipt (in-memory), even if persistence failed. */
  readonly receipt: TestnetQualificationReceipt;
  /** Shared receipt if the runner produced one (raw persistence must have succeeded first). */
  readonly sharedReceipt?: SharedQualificationReceipt;
}

// ---------- receipt shape conversions (bigint → string for persistence) ----------

function b(v: bigint): string { return v.toString(); }

function toReceiptAuthority(a: RemoteTestnetAuthority): ReceiptRemoteAuthority {
  return {
    authorityKind: a.authorityKind,
    endpoint: a.endpoint,
    observedAt: a.observedAt,
    network: a.network,
    serverVersion: a.serverVersion,
    ...(a.rpcApiVersion !== undefined ? { rpcApiVersion: a.rpcApiVersion } : {}),
    isSynced: a.isSynced,
    hasUtxoIndex: a.hasUtxoIndex,
    virtualDaaScore: b(a.virtualDaaScore),
    capabilities: a.capabilities,
    probeHashes: a.probeHashes
  };
}

function toReceiptFunding(f: SourceUtxoEvidence): ReceiptSourceUtxoEvidence {
  return {
    outpoint: f.outpoint,
    address: f.address,
    amountSompi: b(f.amountSompi),
    ...(f.scriptPublicKey !== undefined ? { scriptPublicKey: f.scriptPublicKey } : {}),
    isCoinbase: f.isCoinbase,
    ...(f.blockDaaScore !== undefined ? { blockDaaScore: b(f.blockDaaScore) } : {}),
    ...(f.observedVirtualDaaScore !== undefined ? { observedVirtualDaaScore: b(f.observedVirtualDaaScore) } : {}),
    observedAt: f.observedAt,
    maturityResolvedVia: f.maturityResolvedVia,
    ...(f.localReservation ? { localReservation: f.localReservation } : {})
  };
}

function toReceiptSubmission(s: SubmissionOutcome): ReceiptSubmissionOutcome {
  return {
    state: s.state,
    txid: s.txid,
    attempts: s.attempts,
    resolvedVia: s.resolvedVia,
    ...(s.witnessAddress !== undefined ? { witnessAddress: s.witnessAddress } : {}),
    resolvedAt: s.resolvedAt
  };
}

function toReceiptAcceptance(a: AcceptanceEvidence): ReceiptAcceptanceEvidence {
  return { txid: a.txid, acceptedAt: a.acceptedAt, detectedVia: a.detectedVia, witnessAddress: a.witnessAddress };
}

function toReceiptInclusion(i: InclusionEvidence): ReceiptInclusionEvidence {
  return {
    txid: i.txid,
    inclusionBlockHash: i.inclusionBlockHash,
    inclusionDaaScore: b(i.inclusionDaaScore),
    observedAt: i.observedAt
  };
}

function toReceiptConfirmation(c: ConfirmationEvidence): ReceiptConfirmationEvidence {
  return {
    txid: c.txid,
    inclusionBlockHash: c.inclusionBlockHash,
    inclusionDaaScore: b(c.inclusionDaaScore),
    observedAt: c.observedAt,
    virtualDaaScoreAtObservation: b(c.virtualDaaScoreAtObservation),
    deltaDaa: b(c.deltaDaa),
    configuredDaaDelta: b(c.configuredDaaDelta),
    criterion: c.criterion
  };
}

function buildRawReceipt(input: {
  qualificationId: string;
  network: string;
  startedAt: Date;
  completedAt: Date;
  outcome: QualificationOutcome;
  toolchain: QualificationToolchainIdentity;
  authority: RemoteTestnetAuthority;
  funding: SourceUtxoEvidence;
  standardL1?: StandardL1ScenarioResult;
  blocker?: ScenarioBlocker;
}): TestnetQualificationReceipt {
  const evidence: TestnetQualificationReceipt["evidence"] = {
    remoteAuthority: toReceiptAuthority(input.authority),
    funding: [toReceiptFunding(input.funding)],
    ...(input.standardL1?.submission
      ? { submissions: [toReceiptSubmission(input.standardL1.submission)] }
      : {}),
    ...(input.standardL1?.acceptance
      ? { acceptances: [toReceiptAcceptance(input.standardL1.acceptance)] }
      : {}),
    ...(input.standardL1?.inclusion
      ? { inclusions: [toReceiptInclusion(input.standardL1.inclusion)] }
      : {}),
    ...(input.standardL1?.confirmation
      ? { confirmations: [toReceiptConfirmation(input.standardL1.confirmation)] }
      : {}),
    // notes: intentionally omitted from the standard L1 emission. Local
    // scenario-only metadata (blocker) belongs to the artifacts section,
    // not the notes freeform slot which the redactor strips.
    ...(input.blocker || input.standardL1
      ? {
          notes: {
            ...(input.blocker ? { blocker: input.blocker } : {}),
            ...(input.standardL1
              ? {
                  standardL1: {
                    watchAddresses: input.standardL1.watchAddresses,
                    ...(input.standardL1.plan
                      ? {
                          plan: {
                            plannerAuthority: input.standardL1.plan.plannerAuthority,
                            ...(input.standardL1.plan.plannerAuthorityDetail !== undefined
                              ? { plannerAuthorityDetail: input.standardL1.plan.plannerAuthorityDetail }
                              : {}),
                            mass: b(input.standardL1.plan.mass),
                            fee: b(input.standardL1.plan.fee),
                            ...(input.standardL1.plan.storageMass !== undefined
                              ? { storageMass: b(input.standardL1.plan.storageMass) }
                              : {}),
                            outputs: input.standardL1.plan.outputs.map((o) => ({
                              address: o.address,
                              amountSompi: b(o.amountSompi)
                            })),
                            ...(input.standardL1.plan.changeAddress !== undefined
                              ? { changeAddress: input.standardL1.plan.changeAddress }
                              : {}),
                            ...(input.standardL1.plan.changeAmountSompi !== undefined
                              ? { changeAmountSompi: b(input.standardL1.plan.changeAmountSompi) }
                              : {})
                          }
                        }
                      : {})
                  }
                }
              : {})
          }
        }
      : {})
  };

  return {
    schema: RAW_RECEIPT_SCHEMA,
    schemaVersion: RAW_RECEIPT_SCHEMA_VERSION,
    qualificationId: input.qualificationId,
    network: input.network,
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    outcome: input.outcome,
    toolchain: input.toolchain,
    evidence
  };
}

// ---------- runner ----------

/**
 * Execute a qualification run.
 *
 * Order of events (strict):
 *  1. Run the scenario (currently only `standard-l1`).
 *  2. Compose the raw receipt from evidence returned by the scenario.
 *  3. Attempt to persist the raw receipt. Failure NEVER mutates the
 *     qualification outcome.
 *  4. If raw persistence succeeded, derive and persist the shared
 *     receipt. Shared failure NEVER mutates the qualification outcome
 *     nor the raw persistence outcome.
 */
export async function runQualification(input: RunnerInput): Promise<RunnerOutcome> {
  const now = input.now ?? (() => new Date());

  // 1. Run scenario.
  let standardL1: StandardL1ScenarioResult | undefined;
  let scenarioBlocker: ScenarioBlocker | undefined;
  let qualification: QualificationOutcome = "UNRESOLVED";

  if (input.standardL1) {
    standardL1 = await runStandardL1Scenario({
      authority: input.authority,
      fundingEvidence: input.fundingEvidence,
      productPath: input.standardL1.productPath,
      submissionRpc: input.standardL1.submissionRpc,
      observerRpc: input.standardL1.observerRpc,
      fromAddress: input.standardL1.fromAddress,
      toAddress: input.standardL1.toAddress,
      amountSompi: input.standardL1.amountSompi,
      configuredDaaDelta: input.standardL1.configuredDaaDelta,
      ...(input.standardL1.submissionOptions ? { submissionOptions: input.standardL1.submissionOptions } : {}),
      ...(input.standardL1.acceptanceOptions ? { acceptanceOptions: input.standardL1.acceptanceOptions } : {}),
      ...(input.standardL1.confirmationOptions ? { confirmationOptions: input.standardL1.confirmationOptions } : {}),
      ...(input.now ? { now: input.now } : {}),
      ...(input.sleep ? { sleep: input.sleep } : {})
    });
    qualification = standardL1.outcome;
    if (standardL1.blocker) scenarioBlocker = standardL1.blocker;
  } else {
    // No scenario bound → the run cannot produce a positive outcome, but
    // it is a valid receipt of "nothing to attempt".
    qualification = "UNRESOLVED";
    scenarioBlocker = {
      stage: "plan-and-sign",
      code: "NO_SCENARIO_BOUND",
      message: "Runner invoked without any scenario binding; no L1 experiment executed."
    };
  }

  const completedAt = now();
  const receipt = buildRawReceipt({
    qualificationId: input.qualificationId,
    network: input.authority.network.observed,
    startedAt: input.startedAt,
    completedAt,
    outcome: qualification,
    toolchain: input.toolchain,
    authority: input.authority,
    funding: input.fundingEvidence,
    ...(standardL1 ? { standardL1 } : {}),
    ...(scenarioBlocker ? { blocker: scenarioBlocker } : {})
  });

  // 2. Persist raw.
  const errors: { stage: "raw" | "shared"; code?: string; message: string }[] = [];
  let persistedRaw: PersistedRawReceipt | undefined;
  try {
    persistedRaw = await persistRawReceipt({ receipt, rawDir: input.rawDir });
  } catch (err: any) {
    errors.push({
      stage: "raw",
      code: err?.reason ?? err?.code ?? "RAW_PERSIST_FAILED",
      message: err instanceof Error ? err.message : String(err)
    });
  }

  // 3. Derive + persist shared iff raw succeeded and a sharedDir is given.
  let sharedReceipt: SharedQualificationReceipt | undefined;
  let persistedShared: PersistedShared | undefined;
  let sharedState: EvidencePersistenceState = "not-attempted";
  if (persistedRaw && input.sharedDir) {
    try {
      const derived = await deriveSharedReceipt({ rawFilePath: persistedRaw.filePath });
      sharedReceipt = derived.shared;
      persistedShared = await persistSharedReceipt({ shared: derived.shared, sharedDir: input.sharedDir });
      sharedState = "persisted";
    } catch (err: any) {
      sharedState = "failed";
      errors.push({
        stage: "shared",
        code: err?.reason ?? err?.code ?? "SHARED_PERSIST_FAILED",
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const evidencePersistence: RunnerEvidencePersistence = {
    raw: persistedRaw ? "persisted" : "failed",
    ...(persistedRaw ? { rawFilePath: persistedRaw.filePath, rawDigest: persistedRaw.digest.value } : {}),
    shared: sharedState,
    ...(persistedShared ? { sharedFilePath: persistedShared.filePath, sharedDigest: persistedShared.digest.value } : {}),
    ...(errors.length > 0 ? { errors } : {})
  };

  return {
    qualification: {
      outcome: qualification,
      ...(scenarioBlocker ? { blocker: scenarioBlocker } : {})
    },
    scenarios: {
      ...(standardL1 ? { standardL1 } : {})
    },
    evidencePersistence,
    receipt,
    ...(sharedReceipt ? { sharedReceipt } : {})
  };
}
