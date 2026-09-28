// Demo-cut step 2 · Wave 2(f) / T-A14b — the CLI surface of the Q4 model.
//
// `hardkas tx status <txId>` and `hardkas tx wait <txId>` PRESENT what the SDK
// derives from the workspace evidence (`sdk.tx.observe` adds ONE sealed
// `hardkas.txObservation.v1`; `sdk.tx.status` derives from the submission plus every
// verified observation, under the HardKAS product policy). Nothing here decides a
// state: there is no second state machine, only formatting of `DerivedTxStatus`.
// Q4 as ratified: SUBMITTED ≠ in the mempool; confirmations are blue-score depth;
// FINALIZED is final according to the observed virtual-chain finality rule at an
// observation point — never "irreversible".

import type { DerivedTxStatus } from "@hardkas/artifacts";

export const SYNTHETIC_TXID = /^synthetic-[0-9a-f]{64}$/;
export const NETWORK_TXID = /^[0-9a-f]{64}$/;

export function isTxIdentifier(value: string): boolean {
  return SYNTHETIC_TXID.test(value) || NETWORK_TXID.test(value);
}

type Sdk = any;

export interface TxStatusLook {
  /** An observation was taken and persisted for this call. */
  taken: boolean;
  artifactId?: string;
  path?: string;
  /** Why no observation was taken (simulator txId, `--no-observe`, or the observer's error). */
  reason?: string;
}

export interface TxStatusRunnerResult {
  txId: string;
  network: string;
  derived: DerivedTxStatus;
  look: TxStatusLook;
}

/**
 * Opens the SDK on the network the evidence belongs to: an explicit `--network`,
 * else the network of the submission recorded for `txId`, else the workspace default.
 * The observer is always the node configured for that network (no ad-hoc URL: an
 * observation must be attributed to the observer that actually answered).
 */
export async function openSdkForTx(txId: string, workspaceRoot: string, network?: string): Promise<{ sdk: Sdk; network: string }> {
  const { Hardkas } = await import("@hardkas/sdk");
  const probe: Sdk = await Hardkas.open({ cwd: workspaceRoot });
  let recorded: string | undefined;
  try {
    const submission: any = await probe.artifacts.read({ tx: txId });
    if (typeof submission?.networkId === "string") recorded = submission.networkId;
  } catch {
    recorded = undefined;
  }
  const target = network ?? recorded ?? String(probe.network);
  if (target === String(probe.network)) return { sdk: probe, network: target };
  return { sdk: await Hardkas.open({ cwd: workspaceRoot, network: target }), network: target };
}

/** ONE look (unless disabled or synthetic), then the derived state from the stored evidence. */
export async function runTxStatus(input: {
  txId: string;
  observe?: boolean;
  network?: string;
  workspaceRoot?: string;
  sdk?: Sdk;
}): Promise<TxStatusRunnerResult> {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  const opened = input.sdk
    ? { sdk: input.sdk, network: String(input.network ?? input.sdk.network) }
    : await openSdkForTx(input.txId, workspaceRoot, input.network);
  const { sdk, network } = opened;

  let look: TxStatusLook;
  if (SYNTHETIC_TXID.test(input.txId)) {
    look = { taken: false, reason: "a simulator txId: there is no network to observe; the state derives from the simulator receipt" };
  } else if (input.observe === false) {
    look = { taken: false, reason: "not requested (--no-observe): derived from the evidence already in this workspace" };
  } else {
    try {
      const r = await sdk.tx.observe(input.txId);
      look = { taken: true, artifactId: r.observation.contentHash, ...(r.observationPath ? { path: r.observationPath } : {}) };
    } catch (e: any) {
      look = { taken: false, reason: `the configured observer could not be read: ${e?.code ? `[${e.code}] ` : ""}${e?.message ?? String(e)}` };
    }
  }
  const derived: DerivedTxStatus = await sdk.tx.status(input.txId);
  return { txId: input.txId, network, derived, look };
}

/** `STATE` plus its depth when the model defines one, e.g. `CONFIRMED (142 blue-score confirmations)`. */
export function stateHeadline(derived: DerivedTxStatus): string {
  const blue = derived.confirmations?.blue;
  switch (derived.status) {
    case "ACCEPTED":
      return `ACCEPTED (${blue ?? "?"} blue-score confirmations; CONFIRMED at ${derived.policy.minConfirmations})`;
    case "CONFIRMED":
      return `CONFIRMED (${blue ?? "?"} blue-score confirmations ≥ ${derived.policy.minConfirmations})`;
    case "FINALIZED":
      return `FINALIZED (${blue ?? "?"} blue-score confirmations; finality depth ${derived.finality?.depth ?? "?"})`;
    default:
      return derived.status;
  }
}

/** Human rows, in the order they are read. Values come from the derived state only. */
export function renderTxStatusRows(result: TxStatusRunnerResult): Record<string, string | undefined> {
  const d = result.derived;
  const p = d.policy;
  const observers = d.observers.map((o) => `${o.description} (${o.observerId})`).join("; ");
  const evidence = [
    d.evidence.submissionArtifactId ? `submission ${d.evidence.submissionArtifactId}` : "no submission recorded in this workspace",
    `${d.evidence.observationArtifactIds.length} deciding observation(s)`,
    d.evidence.ignored.length > 0 ? `${d.evidence.ignored.length} ignored` : undefined
  ]
    .filter(Boolean)
    .join(" · ");
  const perObserver =
    d.perObserver.length > 1 || d.status === "CONFLICTING_OBSERVATIONS"
      ? d.perObserver
          .map((h) => `${h.observerId}: ${h.status}${h.acceptingBlockHash ? ` (${h.acceptingBlockHash})` : ""}`)
          .join("; ")
      : undefined;
  return {
    "Tx ID": result.txId,
    Network: result.network,
    State: stateHeadline(d),
    "Accepting Block": d.acceptingBlockHash,
    Finality:
      d.status === "FINALIZED" && d.finality
        ? `final according to the observed Kaspa virtual-chain finality rule at sink blue score ${d.finality.asObservedAt.sinkBlueScore} (observer ${d.finality.observerId}); not a claim of irreversibility`
        : undefined,
    Policy: `${p.policyId} v${p.policyVersion}: CONFIRMED at ≥ ${p.minConfirmations} blue-score confirmations (${p.origin === "hardkas-product-default" ? "a HardKAS product default, not a Kaspa parameter" : "set by the caller"})`,
    "Observed Through": observers || undefined,
    "Per Observer": perObserver,
    Evidence: evidence,
    "This Look": result.look.taken ? `new observation ${result.look.artifactId}` : `no new observation: ${result.look.reason}`,
    Why: d.reasons.join(" · ")
  };
}

export function txStatusJson(result: TxStatusRunnerResult): Record<string, unknown> {
  return {
    ok: true,
    command: "tx status",
    mode: "cli",
    txId: result.txId,
    network: result.network,
    state: result.derived.status,
    ...(result.derived.confirmations ? { confirmations: result.derived.confirmations } : {}),
    isFinal: result.derived.isFinal,
    look: result.look,
    derived: result.derived
  };
}
