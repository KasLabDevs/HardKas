import { HardkasSchemas } from "@hardkas/core";
import { CURRENT_HASH_VERSION, readDeclaredHashVersion } from "./canonical.js";
import { checkArtifactIdentity } from "./resolve.js";
import { TxObservationSchema, TxSubmissionSchema } from "./schemas.js";
import type { TxObservation } from "./schemas.js";
import { checkTxObservationCoherence } from "./tx-observation.js";

// Wave 2(a) · Q4 (ratified 2026-09-26) / IC-2′.4 — `deriveTxStatus`.
//
// "Persist facts; derive states. Never persist a mutable transaction status as
// evidence." Submissions and observations are immutable evidence; ACCEPTED,
// CONFIRMED(n), REORGED and FINALIZED are conclusions derived from that set under
// a versioned policy. Only FULL-scope (hashVersion 5, identity-checked) evidence
// decides (IC-2′.8, T-RS-8).
//
// Observer locality (Wave 2(a) security review): a temporal history
// (accepted → removed ⇒ REORGED; finality → removed ⇒ conflict) is derived ONLY
// within one observer (`observer.observerId`). Across observers nothing is
// causal: agreement reinforces, disagreement is `CONFLICTING_OBSERVATIONS` with
// `observer_views_disagree`, never a reorg and never an observed finality violation.

export type TxStatusKind =
  | "REJECTED_BY_NODE"
  | "SUBMITTED"
  | "MEMPOOL_ACCEPTED"
  | "MEMPOOL_ORPHAN"
  | "ACCEPTED"
  | "CONFIRMED"
  | "FINALIZED"
  | "REORGED"
  | "UNOBSERVABLE_PRUNED"
  | "INSUFFICIENT_EVIDENCE"
  | "CONFLICTING_OBSERVATIONS"
  | "SYNTHETIC_EXECUTED";

export interface TxStatusPolicy {
  readonly policyId: string;
  readonly policyVersion: number;
  /** Who chose `minConfirmations`: never "kaspa"/"upstream" — depth thresholds are a product choice. */
  readonly origin: "hardkas-product-default" | "user";
  /** Blue-score depth at which `isConfirmed(policy)` answers true. */
  readonly minConfirmations: number;
  readonly confirmationUnit: "blue-score";
}

/**
 * HardKAS product default (Q4 point 4, as ratified): `100` is an explicit,
 * versioned HardKAS policy choice for UX. It is NOT a Kaspa parameter and NOT a
 * consequence of the reference wallet's 100-DAA maturity (a different unit and
 * a different domain).
 */
export const TX_STATUS_POLICY_HARDKAS_DEFAULT_V1: TxStatusPolicy = Object.freeze({
  policyId: "hardkas.txStatusPolicy.default",
  policyVersion: 1,
  origin: "hardkas-product-default",
  minConfirmations: 100,
  confirmationUnit: "blue-score"
});

/** What ONE observer's own history supports. `NO_CLAIM` = only absences were observed. */
export type ObserverHistoryStatus =
  | "FINALIZED"
  | "CONFIRMED"
  | "ACCEPTED"
  | "REORGED"
  /** This observer reports a specific block NOT on its selected chain without having accepted it itself (a negative claim about that block). */
  | "NOT_ON_CHAIN"
  | "MEMPOOL_ACCEPTED"
  | "MEMPOOL_ORPHAN"
  | "UNOBSERVABLE_PRUNED"
  | "CONFLICTING_OBSERVATIONS"
  | "NO_CLAIM";

export interface ObserverHistory {
  observerId: string;
  status: ObserverHistoryStatus;
  acceptingBlockHash?: string;
  confirmations?: { blue: string; daa?: string; unit: "blue-score" };
  finality?: DerivedTxStatus["finality"];
  latestPoint: { sinkHash: string; sinkBlueScore: string; virtualDaaScore: string };
  observationArtifactIds: string[];
  reasons: string[];
}

export interface DerivedTxStatus {
  txId: string;
  status: TxStatusKind;
  policy: TxStatusPolicy;
  /** Objective depth of the accepting block: the MINIMUM across the observers that agree on it. */
  confirmations?: { blue: string; daa?: string; unit: "blue-score" };
  acceptingBlockHash?: string;
  finality?: {
    depth: string;
    rule: "kaspa-virtual-chain-finality";
    /** Final according to the observed Kaspa virtual-chain finality rule at THIS observation point. */
    asObservedAt: { sinkHash: string; sinkBlueScore: string; virtualDaaScore: string };
    observerId: string;
  };
  /** Each observer's own history; the top-level status is a combination of these, never a merge of their timelines. */
  perObserver: ObserverHistory[];
  /** The observer(s) whose evidence decided; descriptions, never node identities (D-Q1.a interim). */
  observers: Array<{ observerId: string; kind: "rpc" | "synthetic"; networkId: string; serverVersion?: string; description: string }>;
  evidence: {
    submissionArtifactId?: string;
    observationArtifactIds: string[];
    ignored: Array<{ artifactId?: string; reason: string }>;
  };
  reasons: string[];
  /** Only FINALIZED is terminal for a txId. */
  isFinal: boolean;
}

type Ignored = { artifactId?: string; reason: string };

type Submission =
  | { kind: "submission"; artifactId: string; accepted: boolean; txId: string }
  | { kind: "synthetic-receipt"; artifactId: string; txId: string }
  | { kind: "none" };

function fullIdentity(artifact: any): { ok: true; artifactId: string } | { ok: false; reason: string } {
  const declared = readDeclaredHashVersion(artifact);
  if (declared === null) return { ok: false, reason: "hashVersion invalid or absent" };
  if (declared !== CURRENT_HASH_VERSION) return { ok: false, reason: `hashVersion ${declared} is LEGACY (authScope ≠ FULL): never decides (IC-2′.8)` };
  const check = checkArtifactIdentity(artifact);
  if (!check.ok) return { ok: false, reason: `identity does not verify: ${check.issues.map((i) => i.code).join(", ")}` };
  return { ok: true, artifactId: check.artifactId };
}

function classifySubmission(submission: unknown, txId: string, ignored: Ignored[]): Submission {
  if (submission === undefined || submission === null) return { kind: "none" };
  const s: any = submission;
  const identity = fullIdentity(s);
  if (!identity.ok) {
    ignored.push({ artifactId: typeof s?.contentHash === "string" ? s.contentHash : undefined, reason: `submission: ${identity.reason}` });
    return { kind: "none" };
  }
  if (s.schema === HardkasSchemas.TxSubmissionV1) {
    const parsed = TxSubmissionSchema.safeParse(s);
    if (!parsed.success) {
      ignored.push({ artifactId: identity.artifactId, reason: "submission: schema invalid" });
      return { kind: "none" };
    }
    if (parsed.data.txId !== txId) {
      ignored.push({ artifactId: identity.artifactId, reason: `submission: txId ${parsed.data.txId} is not ${txId}` });
      return { kind: "none" };
    }
    return { kind: "submission", artifactId: identity.artifactId, accepted: parsed.data.submitResult.accepted === true, txId };
  }
  if (s.schema === HardkasSchemas.TxReceipt || s.schema === HardkasSchemas.TxReceiptV1) {
    if (s.txId !== txId) {
      ignored.push({ artifactId: identity.artifactId, reason: `receipt: txId ${String(s.txId)} is not ${txId}` });
      return { kind: "none" };
    }
    if (s.mode === "simulator") return { kind: "synthetic-receipt", artifactId: identity.artifactId, txId };
    ignored.push({ artifactId: identity.artifactId, reason: "a network txReceipt is a legacy submission: its status is not evidence (IC-2′.8)" });
    return { kind: "none" };
  }
  ignored.push({ artifactId: identity.artifactId, reason: `not a submission: ${String(s.schema)}` });
  return { kind: "none" };
}

interface ValidObservation {
  artifactId: string;
  o: TxObservation;
  sinkBlue: bigint;
}

const byPoint = (a: ValidObservation, b: ValidObservation): number => {
  if (a.sinkBlue !== b.sinkBlue) return a.sinkBlue < b.sinkBlue ? -1 : 1;
  if (a.o.observedAt !== b.o.observedAt) return a.o.observedAt < b.o.observedAt ? -1 : 1;
  return a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0;
};

function collectObservations(observations: unknown[], txId: string, submission: Submission, ignored: Ignored[]): ValidObservation[] {
  const valid: ValidObservation[] = [];
  for (const raw of observations) {
    const r: any = raw;
    const artifactId = typeof r?.contentHash === "string" ? r.contentHash : undefined;
    if (r?.schema !== HardkasSchemas.TxObservationV1) {
      ignored.push({ artifactId, reason: `not an observation: ${String(r?.schema)}` });
      continue;
    }
    const identity = fullIdentity(r);
    if (!identity.ok) {
      ignored.push({ artifactId, reason: `observation: ${identity.reason}` });
      continue;
    }
    const parsed = TxObservationSchema.safeParse(r);
    if (!parsed.success) {
      ignored.push({ artifactId: identity.artifactId, reason: "observation: schema invalid" });
      continue;
    }
    const coherence = checkTxObservationCoherence(parsed.data);
    if (!coherence.ok) {
      ignored.push({ artifactId: identity.artifactId, reason: `observation incoherent: ${coherence.message}` });
      continue;
    }
    const o = parsed.data;
    if (o.subject.txId !== txId) {
      ignored.push({ artifactId: identity.artifactId, reason: `observation subject ${o.subject.txId} is not ${txId}` });
      continue;
    }
    if (
      o.subject.submissionArtifactId !== undefined &&
      submission.kind === "submission" &&
      o.subject.submissionArtifactId !== submission.artifactId
    ) {
      ignored.push({ artifactId: identity.artifactId, reason: "observation names a different submission" });
      continue;
    }
    valid.push({ artifactId: identity.artifactId, o, sinkBlue: BigInt(o.point.sinkBlueScore) });
  }
  valid.sort(byPoint);
  return valid;
}

const pointOf = (x: ValidObservation) => ({
  sinkHash: x.o.point.sinkHash,
  sinkBlueScore: x.o.point.sinkBlueScore,
  virtualDaaScore: x.o.point.virtualDaaScore
});

/**
 * ONE observer's history, in its own point order. This is the only place where a
 * sequence of observations is read as a timeline.
 */
function deriveObserverHistory(observerId: string, group: ValidObservation[], policy: TxStatusPolicy): ObserverHistory {
  const sorted = [...group].sort(byPoint);
  const ids = sorted.map((x) => x.artifactId);
  const latest = sorted[sorted.length - 1]!;
  const base = { observerId, latestPoint: pointOf(latest), observationArtifactIds: ids };

  const accepted = new Map<string, ValidObservation>();
  const everAccepted = new Set<string>();
  let finalized: ValidObservation | undefined;
  let lastRemoval: ValidObservation | undefined;
  for (const x of sorted) {
    const f = x.o.finding;
    if (f.type === "chain_accepted") {
      accepted.set(f.acceptingBlockHash, x);
      everAccepted.add(f.acceptingBlockHash);
    } else if (f.type === "finality_reached") {
      accepted.set(f.acceptingBlockHash, x);
      everAccepted.add(f.acceptingBlockHash);
      finalized = x;
    } else if (f.type === "chain_removed") {
      if (finalized && finalized.o.finding.type === "finality_reached" && finalized.o.finding.acceptingBlockHash === f.acceptingBlockHash) {
        return {
          ...base,
          status: "CONFLICTING_OBSERVATIONS",
          reasons: [`this observer reported block ${f.acceptingBlockHash} final and later removed from its selected chain: its own history is incoherent`]
        };
      }
      accepted.delete(f.acceptingBlockHash);
      if (everAccepted.has(f.acceptingBlockHash)) lastRemoval = x;
    }
  }
  if (finalized && finalized.o.finding.type === "finality_reached") {
    const f = finalized.o.finding;
    return {
      ...base,
      status: "FINALIZED",
      acceptingBlockHash: f.acceptingBlockHash,
      confirmations: { blue: f.confirmationsBlue, unit: "blue-score" },
      finality: {
        depth: f.finalityDepth,
        rule: "kaspa-virtual-chain-finality",
        asObservedAt: pointOf(finalized),
        observerId
      },
      reasons: [`final according to the observed Kaspa virtual-chain finality rule at sink blue score ${finalized.o.point.sinkBlueScore} (this observer's view)`]
    };
  }
  if (accepted.size > 1) {
    return {
      ...base,
      status: "CONFLICTING_OBSERVATIONS",
      reasons: [`this observer reports two accepting blocks both on its selected chain: ${Array.from(accepted.keys()).join(", ")}`]
    };
  }
  if (accepted.size === 1) {
    const [block, x] = Array.from(accepted.entries())[0]!;
    const f = x.o.finding as Extract<TxObservation["finding"], { type: "chain_accepted" }>;
    const blue = BigInt(f.confirmationsBlue);
    const confirmed = blue >= BigInt(policy.minConfirmations);
    return {
      ...base,
      status: confirmed ? "CONFIRMED" : "ACCEPTED",
      acceptingBlockHash: block,
      confirmations: { blue: f.confirmationsBlue, ...(f.confirmationsDaa ? { daa: f.confirmationsDaa } : {}), unit: "blue-score" },
      reasons: [
        confirmed
          ? `accepted by chain block ${block} with ${blue.toString()} blue-score confirmations ≥ policy ${policy.policyId} v${policy.policyVersion} (${policy.minConfirmations}, ${policy.origin})`
          : `accepted by chain block ${block} with ${blue.toString()} blue-score confirmations (< ${policy.minConfirmations}); revertible until finality`
      ]
    };
  }
  const f = latest.o.finding;
  if (lastRemoval && (latest === lastRemoval || f.type === "not_found" || f.type === "mempool_absent")) {
    return {
      ...base,
      status: "REORGED",
      acceptingBlockHash: (lastRemoval.o.finding as any).acceptingBlockHash,
      reasons: [`the accepting block ${(lastRemoval.o.finding as any).acceptingBlockHash} left this observer's selected chain and no new acceptance was observed by it`]
    };
  }
  if (f.type === "chain_removed") {
    // Never accepted by this observer: a negative claim about that block, not a reorg.
    return {
      ...base,
      status: "NOT_ON_CHAIN",
      acceptingBlockHash: f.acceptingBlockHash,
      reasons: [`this observer reports block ${f.acceptingBlockHash} as not on its selected chain (it never observed the acceptance itself)`]
    };
  }
  if (f.type === "mempool_entry") {
    return {
      ...base,
      status: f.isOrphan ? "MEMPOOL_ORPHAN" : "MEMPOOL_ACCEPTED",
      reasons: [f.isOrphan ? "present in this observer's orphan pool (parents missing): not accepted" : "present in this observer's mempool at the observation point (local, transient)"]
    };
  }
  if (f.type === "pruned_unobservable") {
    return { ...base, status: "UNOBSERVABLE_PRUNED", reasons: [`this observer can no longer observe the transaction: ${f.reason}`] };
  }
  return { ...base, status: "NO_CLAIM", reasons: ["absence from the mempool or from the scanned chain window is not evidence of anything by itself"] };
}

const POSITIVE = new Set<ObserverHistoryStatus>(["FINALIZED", "CONFIRMED", "ACCEPTED"]);
const NEGATIVE = new Set<ObserverHistoryStatus>(["REORGED", "NOT_ON_CHAIN"]);
const MEMPOOL_LEVEL = new Set<ObserverHistoryStatus>(["MEMPOOL_ACCEPTED", "MEMPOOL_ORPHAN"]);

/**
 * Derives the state of `txId` from ONE submission (optional) and N observations
 * under `policy`. Pure and deterministic: same evidence ⇒ same conclusion.
 * Histories are per observer; the top level combines them without causality.
 */
export function deriveTxStatus(input: {
  txId: string;
  submission?: unknown;
  observations: unknown[];
  policy?: TxStatusPolicy;
}): DerivedTxStatus {
  const policy = input.policy ?? TX_STATUS_POLICY_HARDKAS_DEFAULT_V1;
  const ignored: Ignored[] = [];
  const submission = classifySubmission(input.submission, input.txId, ignored);
  const valid = collectObservations(input.observations, input.txId, submission, ignored);

  const observersOf = (xs: ValidObservation[]) => {
    const seen = new Map<string, DerivedTxStatus["observers"][number]>();
    for (const x of xs) {
      const key = x.o.observer.observerId;
      if (!seen.has(key)) {
        seen.set(key, {
          observerId: key,
          kind: x.o.observer.kind,
          networkId: x.o.observer.networkId,
          ...(x.o.observer.serverVersion ? { serverVersion: x.o.observer.serverVersion } : {}),
          description: x.o.observer.description
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => (a.observerId < b.observerId ? -1 : 1));
  };

  const result = (
    status: TxStatusKind,
    decidedBy: ValidObservation[],
    perObserver: ObserverHistory[],
    reasons: string[],
    extra: Partial<DerivedTxStatus> = {}
  ): DerivedTxStatus => ({
    txId: input.txId,
    status,
    policy,
    perObserver,
    observers: observersOf(decidedBy),
    evidence: {
      ...(submission.kind !== "none" ? { submissionArtifactId: submission.artifactId } : {}),
      observationArtifactIds: decidedBy.map((x) => x.artifactId).sort(),
      ignored
    },
    reasons,
    isFinal: status === "FINALIZED",
    ...extra
  });

  // Synthetic evidence never mixes with network evidence (IC-2′.7).
  const synthetic = valid.filter((x) => x.o.finding.type === "synthetic_executed");
  const network = valid.filter((x) => x.o.finding.type !== "synthetic_executed");
  if (synthetic.length > 0 || submission.kind === "synthetic-receipt") {
    if (network.length > 0) {
      return result("CONFLICTING_OBSERVATIONS", valid, [], ["synthetic and network evidence exist for the same txId"]);
    }
    return result("SYNTHETIC_EXECUTED", synthetic, [], ["executed by the HardKAS simulator: no Kaspa consensus was involved"]);
  }

  // One history per observer (the only timelines that exist).
  const groups = new Map<string, ValidObservation[]>();
  for (const x of network) {
    const id = x.o.observer.observerId;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(x);
  }
  const histories = Array.from(groups.entries())
    .map(([observerId, group]) => deriveObserverHistory(observerId, group, policy))
    .sort((a, b) => (a.observerId < b.observerId ? -1 : 1));
  const byId = new Map(histories.map((h) => [h.observerId, h]));
  const obsOf = (hs: ObserverHistory[]) => network.filter((x) => hs.some((h) => h.observerId === x.o.observer.observerId));

  // Combination rules — never causal across observers.
  const intraConflict = histories.filter((h) => h.status === "CONFLICTING_OBSERVATIONS");
  if (intraConflict.length > 0) {
    return result("CONFLICTING_OBSERVATIONS", obsOf(intraConflict), histories, intraConflict.flatMap((h) => h.reasons));
  }

  const positive = histories.filter((h) => POSITIVE.has(h.status));
  const negative = histories.filter((h) => NEGATIVE.has(h.status));
  const chainLevel = [...positive, ...negative];
  if (positive.length > 0) {
    const current = positive;
    const blocks = new Set(current.map((h) => h.acceptingBlockHash!));
    if (blocks.size > 1 || negative.length > 0) {
      // Different observers, incompatible views of the chain: NOT a reorg, NOT a finality violation.
      const views = chainLevel
        .map((h) => `${h.observerId}: ${h.status}${h.acceptingBlockHash ? ` (${h.acceptingBlockHash})` : ""}`)
        .join("; ");
      const fin = current.find((h) => h.status === "FINALIZED");
      return result("CONFLICTING_OBSERVATIONS", obsOf(chainLevel), histories, [
        `observer_views_disagree: ${views}`,
        ...(fin
          ? [`one observer's view satisfies the finality rule and another's does not contain the block: this is a disagreement between observers, not an observed violation of the finality rule in one virtual-chain history`]
          : [])
      ]);
    }
    // All chain-level observers name the same block: agreement reinforces.
    const block = Array.from(blocks)[0]!;
    const finalizedBy = current.filter((h) => h.status === "FINALIZED");
    const minBlue = current.reduce<bigint | undefined>((min, h) => {
      const v = BigInt(h.confirmations!.blue);
      return min === undefined || v < min ? v : min;
    }, undefined)!;
    const withDaa = current.map((h) => h.confirmations?.daa).filter((d): d is string => typeof d === "string");
    const minDaa = withDaa.length === current.length && withDaa.length > 0
      ? withDaa.reduce((min, d) => (BigInt(d) < BigInt(min) ? d : min))
      : undefined;
    const confirmations = { blue: minBlue.toString(), ...(minDaa ? { daa: minDaa } : {}), unit: "blue-score" as const };
    const agreement = current.length > 1 ? ` (${current.length} observers agree on block ${block})` : "";
    if (finalizedBy.length > 0) {
      const h = finalizedBy[0]!;
      return result("FINALIZED", obsOf(current), histories, [`${h.reasons[0]}${agreement}`], {
        acceptingBlockHash: block,
        confirmations,
        ...(h.finality ? { finality: h.finality } : {})
      });
    }
    const confirmed = minBlue >= BigInt(policy.minConfirmations);
    const reason = confirmed
      ? `accepted by chain block ${block} with ${minBlue.toString()} blue-score confirmations (minimum across observers) ≥ policy ${policy.policyId} v${policy.policyVersion} (${policy.minConfirmations}, ${policy.origin})${agreement}`
      : `accepted by chain block ${block} with ${minBlue.toString()} blue-score confirmations (minimum across observers, < ${policy.minConfirmations}); revertible until finality${agreement}`;
    return result(confirmed ? "CONFIRMED" : "ACCEPTED", obsOf(current), histories, [reason], { acceptingBlockHash: block, confirmations });
  }

  // No positive chain claim anywhere. REORGED is an observer's OWN accepted→removed
  // history; observers that only report a block absent (NOT_ON_CHAIN) establish nothing.
  const reorged = histories.filter((h) => h.status === "REORGED");
  if (reorged.length > 0) {
    const block = reorged[0]!.acceptingBlockHash;
    if (!reorged.every((h) => h.acceptingBlockHash === block)) {
      return result("CONFLICTING_OBSERVATIONS", obsOf(reorged), histories, [
        `observer_views_disagree: ${reorged.map((h) => `${h.observerId}: REORGED (${h.acceptingBlockHash})`).join("; ")}`
      ]);
    }
    return result("REORGED", obsOf(reorged), histories, reorged.flatMap((h) => h.reasons), {
      ...(block ? { acceptingBlockHash: block } : {})
    });
  }

  const mempoolLevel = histories.filter((h) => MEMPOOL_LEVEL.has(h.status));
  if (mempoolLevel.length > 0) {
    const statuses = new Set(mempoolLevel.map((h) => h.status));
    if (statuses.size > 1) {
      return result("CONFLICTING_OBSERVATIONS", obsOf(mempoolLevel), histories, [
        `observer_views_disagree: ${mempoolLevel.map((h) => `${h.observerId}: ${h.status}`).join("; ")}`
      ]);
    }
    const status = mempoolLevel[0]!.status as "MEMPOOL_ACCEPTED" | "MEMPOOL_ORPHAN";
    return result(status, obsOf(mempoolLevel), histories, mempoolLevel.flatMap((h) => h.reasons));
  }

  const pruned = histories.filter((h) => h.status === "UNOBSERVABLE_PRUNED");
  if (pruned.length > 0) {
    return result("UNOBSERVABLE_PRUNED", obsOf(pruned), histories, pruned.flatMap((h) => h.reasons));
  }

  const reasons: string[] = [];
  if (histories.length > 0) reasons.push(...histories.flatMap((h) => h.reasons));
  void byId;
  if (submission.kind === "submission") {
    if (submission.accepted) {
      reasons.push("submitTransaction returned success at that instant on the responding node; nothing has been observed since");
      return result("SUBMITTED", [], histories, reasons);
    }
    reasons.push("the responding node rejected this submission");
    return result("REJECTED_BY_NODE", [], histories, reasons);
  }
  reasons.push("no FULL-scope submission or observation decides this txId");
  return result("INSUFFICIENT_EVIDENCE", [], histories, reasons);
}

/** Whether `derived` satisfies `policy.minConfirmations` (FINALIZED always does). */
export function isConfirmed(derived: DerivedTxStatus, policy: TxStatusPolicy = derived.policy): boolean {
  if (derived.status === "FINALIZED") return true;
  if (derived.status !== "CONFIRMED" && derived.status !== "ACCEPTED") return false;
  return derived.confirmations !== undefined && BigInt(derived.confirmations.blue) >= BigInt(policy.minConfirmations);
}
