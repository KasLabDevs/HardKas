// STAGE-B-2 · C4 — a txId this workspace OBSERVED on the network but did not send.
//
// `tx receipt`, `why --tx` and `explain --tx` resolve the HardKAS submission of a txId. A transaction sent by another
// wallet (or by the qualification harness) has no submission here, only the `hardkas.txObservation.v1` looks that
// `tx status --since` / `tx wait --since` recorded. Those looks are evidence of what the node's virtual chain said, so
// the state they derive can be explained — labelled `origin: "observed"`, never as a submission:
//   * no submission, signature, authorization, submit attempt or RPC acceptance answer is created or implied;
//   * the state is `deriveTxStatus` over the verified observations only (the same derivation as `tx status`); an
//     observation that does not verify is counted as ignored and decides nothing;
//   * no observation, or none that verifies → `undefined`: the caller keeps its refusal.
// Only a RECEIPT_NOT_FOUND may fall back here: a submission that does not verify (CANDIDATE_INVALID) or two that
// conflict (RECEIPT_AMBIGUOUS_CONFLICT) stay errors. Nothing here contacts a node.

import { ProjectArtifactStore, deriveTxStatus, type DerivedTxStatus } from "@hardkas/artifacts";
import { NETWORK_TXID, stateHeadline } from "./tx-status-runner.js";

export interface ObservedTxLook {
  artifactId: string;
  observedAt: string;
  observerId: string;
  finding: string;
  /** Whether this look is one the derived state stands on (`derived.evidence.observationArtifactIds`). */
  deciding: boolean;
}

export interface ObservedTx {
  origin: "observed";
  txId: string;
  /** The network(s) the looks were taken on (one, unless the workspace mixes observers of different networks). */
  networks: string[];
  derived: DerivedTxStatus;
  looks: ObservedTxLook[];
  /** Observation files for this txId that do not verify (never used to decide). */
  ignored: number;
}

/** The sentence every surface uses, so the provenance reads the same in receipt, why and explain. */
export const OBSERVED_ONLY =
  "no submission recorded in this workspace: HardKAS observed this transaction on the network but did not send it from here";

/** Verified observations without a submission → the observed view; otherwise `undefined` (plus how many were ignored). */
export function findObservedTx(txId: string, workspaceRoot: string): { observed?: ObservedTx; ignored: number } {
  if (!NETWORK_TXID.test(txId)) return { ignored: 0 };
  const store = new ProjectArtifactStore(workspaceRoot);
  const { observations, rejected } = store.listObservationsByTxId(txId);
  if (observations.length === 0) return { ignored: rejected.length };
  const derived = deriveTxStatus({ txId, observations: observations as any[] });
  const deciding = new Set(derived.evidence.observationArtifactIds);
  const looks = (observations as any[])
    .map((o) => ({
      artifactId: String(o.contentHash),
      observedAt: String(o.observedAt),
      observerId: String(o.observerId ?? o.observer?.observerId ?? "unknown"),
      finding: String(o.finding?.type ?? "unknown"),
      deciding: deciding.has(String(o.contentHash))
    }))
    .sort((a, b) => (a.observedAt < b.observedAt ? -1 : a.observedAt > b.observedAt ? 1 : a.artifactId < b.artifactId ? -1 : 1));
  const networks = [...new Set((observations as any[]).map((o) => String(o.networkId ?? "unknown")))];
  return { observed: { origin: "observed", txId, networks, derived, looks, ignored: rejected.length }, ignored: rejected.length };
}

/** One line: the derived state and what it stands on. */
export function observedStateLine(o: ObservedTx): string {
  const n = o.derived.evidence.observationArtifactIds.length;
  return `${stateHeadline(o.derived)} — derived from ${n} verified observation(s) of the node's virtual chain recorded in this workspace`;
}

export function observedJson(o: ObservedTx): Record<string, unknown> {
  return {
    origin: o.origin,
    note: OBSERVED_ONLY,
    txId: o.txId,
    network: o.networks.length === 1 ? o.networks[0] : o.networks,
    state: o.derived.status,
    ...(o.derived.confirmations ? { confirmations: o.derived.confirmations } : {}),
    ...(o.derived.acceptingBlockHash ? { acceptingBlockHash: o.derived.acceptingBlockHash } : {}),
    submission: null,
    observations: o.looks,
    ignoredObservations: o.ignored,
    derived: o.derived
  };
}

/** Human rows shared by `why --tx` and `explain --tx`. */
export function observedRows(o: ObservedTx): Record<string, string | undefined> {
  return {
    "Tx ID": o.txId,
    Origin: `observed — ${OBSERVED_ONLY}`,
    Network: o.networks.join(", "),
    State: observedStateLine(o),
    "Accepting Block": o.derived.acceptingBlockHash,
    Observations: o.looks.map((l) => `${l.artifactId} (${l.finding}${l.deciding ? "" : ", not deciding"}, ${l.observedAt})`).join("; "),
    Ignored: o.ignored > 0 ? `${o.ignored} observation file(s) for this txId do not verify and decide nothing` : undefined,
    Why: o.derived.reasons.join(" · ")
  };
}

/** The refusal of `tx receipt` when the tx was only observed: still no receipt, but it says what the workspace holds. */
export function receiptNotFoundMessage(txId: string, workspaceRoot: string, original: string): string {
  const { observed, ignored } = findObservedTx(txId, workspaceRoot);
  if (!observed) {
    return ignored > 0 ? `${original} (${ignored} observation file(s) for this txId do not verify and were ignored)` : original;
  }
  return (
    `No receipt for tx ${txId}: ${OBSERVED_ONLY}. It was observed ${observed.looks.length} time(s); derived state: ${stateHeadline(observed.derived)}. ` +
    `See \`hardkas tx status ${txId}\` or \`hardkas query tx ${txId}\`; \`hardkas why --tx ${txId}\` explains it from the observations.`
  );
}
