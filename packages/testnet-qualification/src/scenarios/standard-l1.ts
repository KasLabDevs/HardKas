/**
 * TQ-1 Block 4 — Standard L1 scenario.
 *
 * Question this scenario answers:
 *
 *   Can the existing HardKAS production path execute one standard L1
 *   transaction against TN10 while preserving a trustworthy qualification
 *   receipt from declared funding input through remote observation?
 *
 * Rules (agreed 2026-09-15):
 *
 * - This module ORCHESTRATES the existing HardKAS transaction lifecycle
 *   (plan → sign → submit → observe). It does NOT reimplement any of it.
 *   The `ProductTransactionPath` interface is a caller-supplied binding
 *   into `@hardkas/sdk`; TQ never builds txs itself, never signs itself,
 *   never invents mass/fee/serialization/sighash.
 *
 * - Submission goes through the Block 2 guard. Exactly ONE
 *   `submitTransaction` call per scenario execution. Transport ambiguity
 *   resolves via observation, never via a second submission.
 *
 * - Observation states from Blocks 1/2 stay distinct — submission,
 *   mempool, acceptance, inclusion, confirmation are never collapsed.
 *
 * - `UNRESOLVED` is a valid scenario outcome and is preferable to an
 *   invented PASS or FAIL.
 *
 * - If any upstream primitive is missing or fails, the scenario returns
 *   a FAIL outcome with a `blocker` payload identifying the exact stage
 *   and upstream expectation. It does NOT patch around the missing
 *   primitive. That blocker is Block 5's input.
 */

import type {
  QualificationOutcome
} from "../receipt.js";
import {
  submitWithAmbiguityGuard,
  type SubmissionGuardRpc,
  type SubmissionOutcome,
  type SubmissionGuardOptions
} from "../submission-guard.js";
import {
  waitForAcceptance,
  observeInclusion,
  assertConfirmedByDaaDelta,
  type DaaObserverRpc,
  type AcceptanceEvidence,
  type InclusionEvidence,
  type ConfirmationEvidence
} from "../daa-observer.js";
import type { RemoteTestnetAuthority } from "../remote-node.js";
import type { SourceUtxoEvidence } from "../funding-input.js";

export interface PlanAndSignInput {
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly amountSompi: bigint;
  readonly networkId: string;
}

export interface PlanAndSignResult {
  /** Deterministic tx identity — required for the submission guard. */
  readonly txid: string;
  /** Opaque signed payload; TQ passes it straight to `submitTransaction`. */
  readonly signedTransaction: unknown;
  /** Provenance string reported by the product path (M10-B: `KASPA_WASM_GENERATOR`). */
  readonly plannerAuthority: string;
  /** Optional provenance detail (e.g. `kaspa-wasm@2.0.1`). */
  readonly plannerAuthorityDetail?: string;
  readonly mass: bigint;
  readonly fee: bigint;
  readonly storageMass?: bigint;
  readonly outputs: readonly { readonly address: string; readonly amountSompi: bigint }[];
  readonly changeAddress?: string;
  readonly changeAmountSompi?: bigint;
}

/**
 * The caller-supplied bridge into the HardKAS production tx lifecycle.
 * `planAndSign` MUST use the existing product-layer code paths. TQ never
 * substitutes an alternate planner/signer.
 */
export interface ProductTransactionPath {
  planAndSign(input: PlanAndSignInput): Promise<PlanAndSignResult>;
}

export type ScenarioBlockerStage =
  | "plan-and-sign"
  | "submit"
  | "acceptance"
  | "inclusion"
  | "confirmation";

export interface ScenarioBlocker {
  readonly stage: ScenarioBlockerStage;
  /** Machine-readable code. */
  readonly code: string;
  /** Human-readable description; safe for the receipt (no secrets). */
  readonly message: string;
  /** Optional upstream primitive the caller expected TQ to use. */
  readonly expectedUpstream?: string;
  /** Best-effort file:line locator for the source of the blocker. */
  readonly sourceHint?: string;
}

export interface StandardL1ScenarioInput {
  /** From `probeRemoteTestnet` — provenance/carrier of the network authority. */
  readonly authority: RemoteTestnetAuthority;
  /** From `assertSpendableOrFailClosed` — the declared source UTXO. */
  readonly fundingEvidence: SourceUtxoEvidence;
  readonly productPath: ProductTransactionPath;
  readonly submissionRpc: SubmissionGuardRpc;
  readonly observerRpc: DaaObserverRpc;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly amountSompi: bigint;
  readonly configuredDaaDelta: bigint;
  readonly submissionOptions?: SubmissionGuardOptions;
  readonly acceptanceOptions?: {
    readonly pollIntervalMs?: number;
    readonly maxWaitMs?: number;
  };
  readonly confirmationOptions?: {
    readonly pollIntervalMs?: number;
    readonly maxWaitMs?: number;
  };
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface StandardL1ScenarioResult {
  readonly outcome: QualificationOutcome;
  readonly plan?: PlanAndSignResult;
  readonly submission?: SubmissionOutcome;
  readonly acceptance?: AcceptanceEvidence;
  readonly inclusion?: InclusionEvidence;
  readonly confirmation?: ConfirmationEvidence;
  readonly blocker?: ScenarioBlocker;
  /**
   * The addresses whose UTXO sets the scenario watched during observation.
   * Preserved in the receipt so a reader can reproduce the observation.
   */
  readonly watchAddresses: readonly string[];
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return String(err); } catch { return "<unknown>"; }
}

function toCode(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const anyErr = err as { code?: unknown };
    if (typeof anyErr.code === "string") return anyErr.code;
  }
  return fallback;
}

export async function runStandardL1Scenario(
  input: StandardL1ScenarioInput
): Promise<StandardL1ScenarioResult> {
  const watchAddresses: string[] = [input.toAddress];
  if (input.fromAddress && !watchAddresses.includes(input.fromAddress)) {
    // Change goes back to fromAddress under the current HardKAS planner
    // contract; watch it too so a change-return UTXO counts as inclusion
    // evidence when the recipient UTXO is late to appear.
    watchAddresses.push(input.fromAddress);
  }

  // 1. Plan + sign via existing product path. TQ does not substitute.
  let plan: PlanAndSignResult;
  try {
    plan = await input.productPath.planAndSign({
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      amountSompi: input.amountSompi,
      networkId: input.authority.network.observed
    });
  } catch (err) {
    return {
      outcome: "FAIL",
      watchAddresses,
      blocker: {
        stage: "plan-and-sign",
        code: toCode(err, "PLAN_AND_SIGN_FAILED"),
        message: `Existing HardKAS product path could not produce a signed L1 tx: ${toMessage(err)}`,
        expectedUpstream: "kaspa-wasm@2.0.1 Generator + HardKAS signer (via @hardkas/sdk)"
      }
    };
  }

  // 2. Submit through the Block 2 guard. Exactly ONE submitTransaction call.
  let submission: SubmissionOutcome;
  try {
    submission = await submitWithAmbiguityGuard(
      {
        rpc: input.submissionRpc,
        signedTx: plan.signedTransaction,
        txid: plan.txid,
        watchAddresses
      },
      {
        ...(input.submissionOptions ?? {}),
        ...(input.now ? { now: input.now } : {}),
        ...(input.sleep ? { sleep: input.sleep } : {})
      }
    );
  } catch (err) {
    return {
      outcome: "FAIL",
      plan,
      watchAddresses,
      blocker: {
        stage: "submit",
        code: toCode(err, "SUBMIT_UNEXPECTED_ERROR"),
        message: `Submission guard re-threw an out-of-scope error: ${toMessage(err)}`,
        expectedUpstream: "rusty-kaspad submitTransaction (via HardKAS RPC)"
      }
    };
  }

  // 3. Route on submission state. Observation semantics from Blocks 1/2 are
  // preserved verbatim — no state collapse into "confirmed" / "final".
  switch (submission.state) {
    case "UNRESOLVED": {
      // Never resubmit. Never invent a stronger observation. UNRESOLVED is
      // a valid, evidenced outcome for this run.
      return {
        outcome: "UNRESOLVED",
        plan,
        submission,
        watchAddresses,
        blocker: {
          stage: "submit",
          code: "SUBMIT_TRANSPORT_AMBIGUITY_UNRESOLVED",
          message: `Submission ambiguous and no positive observation within the probe budget. Caller MUST NOT retry.`,
          expectedUpstream: "rusty-kaspad submitTransaction (via HardKAS RPC)"
        }
      };
    }
    case "SAFE_TO_RETRY": {
      // Consensus-level rejection pre-mempool. This is product-layer or
      // network-policy business, not a TQ-orchestration bug. TQ reports it
      // as a FAIL with a blocker payload; it does NOT patch around the
      // rejection by rewriting the tx.
      return {
        outcome: "FAIL",
        plan,
        submission,
        watchAddresses,
        blocker: {
          stage: "submit",
          code: "CONSENSUS_PRE_MEMPOOL_REJECTION",
          message: `Node rejected the tx before it entered mempool. HardKAS product path or upstream primitive is the source of truth; TQ does not rewrite the tx.`,
          expectedUpstream: "rusty-kaspad submitTransaction acceptance rules"
        }
      };
    }
    case "SUBMITTED":
    case "OBSERVED_MEMPOOL":
    case "OBSERVED_ACCEPTED":
      break; // proceed to observation stages
    default: {
      // Should be exhaustive. If it's not, that's a Block 2 regression.
      return {
        outcome: "FAIL",
        plan,
        submission,
        watchAddresses,
        blocker: {
          stage: "submit",
          code: "SUBMIT_STATE_UNKNOWN",
          message: `Submission guard returned an unrecognised state '${(submission as SubmissionOutcome).state}'.`
        }
      };
    }
  }

  // 4. Wait for acceptance if we haven't already witnessed it.
  let acceptance: AcceptanceEvidence | undefined;
  if (submission.state === "OBSERVED_ACCEPTED") {
    // We already have a UTXO hit on witnessAddress — synthesize acceptance
    // evidence from that observation. Timestamp mirrors submission
    // resolution to avoid claiming a stronger observation moment.
    acceptance = {
      txid: submission.txid,
      acceptedAt: submission.resolvedAt,
      detectedVia: "utxo-present-first-observation",
      witnessAddress: submission.witnessAddress ?? input.toAddress
    };
  } else {
    try {
      acceptance = await waitForAcceptance(
        input.observerRpc,
        { txid: submission.txid, watchAddresses },
        {
          ...(input.acceptanceOptions?.pollIntervalMs !== undefined ? { pollIntervalMs: input.acceptanceOptions.pollIntervalMs } : {}),
          ...(input.acceptanceOptions?.maxWaitMs !== undefined ? { maxWaitMs: input.acceptanceOptions.maxWaitMs } : {}),
          ...(input.now ? { now: input.now } : {}),
          ...(input.sleep ? { sleep: input.sleep } : {})
        }
      );
    } catch (err) {
      return {
        outcome: "UNRESOLVED",
        plan,
        submission,
        watchAddresses,
        blocker: {
          stage: "acceptance",
          code: toCode(err, "ACCEPTANCE_TIMEOUT"),
          message: `Acceptance not observed on any watched address within budget: ${toMessage(err)}`,
          expectedUpstream: "rusty-kaspad mempool / UTXO snapshot"
        }
      };
    }
  }

  // 5. Observe inclusion (block hash + block DAA score).
  let inclusion: InclusionEvidence;
  try {
    inclusion = await observeInclusion(
      input.observerRpc,
      { txid: submission.txid, witnessAddress: acceptance.witnessAddress },
      { ...(input.now ? { now: input.now } : {}) }
    );
  } catch (err) {
    // Missing inclusion metadata is a genuine upstream gap — we neither
    // invent it nor infer confirmation without it.
    return {
      outcome: "UNRESOLVED",
      plan,
      submission,
      acceptance,
      watchAddresses,
      blocker: {
        stage: "inclusion",
        code: toCode(err, "INCLUSION_METADATA_MISSING"),
        message: `Inclusion evidence unavailable via the RPC UTXO row: ${toMessage(err)}`,
        expectedUpstream: "rusty-kaspad getUtxosByAddress row (blockHash + blockDaaScore)"
      }
    };
  }

  // 6. Assert confirmation by DAA delta.
  let confirmation: ConfirmationEvidence;
  try {
    confirmation = await assertConfirmedByDaaDelta(
      input.observerRpc,
      inclusion,
      {
        configuredDaaDelta: input.configuredDaaDelta,
        ...(input.confirmationOptions?.pollIntervalMs !== undefined ? { pollIntervalMs: input.confirmationOptions.pollIntervalMs } : {}),
        ...(input.confirmationOptions?.maxWaitMs !== undefined ? { maxWaitMs: input.confirmationOptions.maxWaitMs } : {}),
        ...(input.now ? { now: input.now } : {}),
        ...(input.sleep ? { sleep: input.sleep } : {})
      }
    );
  } catch (err) {
    return {
      outcome: "UNRESOLVED",
      plan,
      submission,
      acceptance,
      inclusion,
      watchAddresses,
      blocker: {
        stage: "confirmation",
        code: toCode(err, "CONFIRMATION_TIMEOUT"),
        message: `DAA delta threshold not met within budget: ${toMessage(err)}`,
        expectedUpstream: "rusty-kaspad getBlockDagInfo.virtualDaaScore progression"
      }
    };
  }

  return {
    outcome: "PASS",
    plan,
    submission,
    acceptance,
    inclusion,
    confirmation,
    watchAddresses
  };
}
