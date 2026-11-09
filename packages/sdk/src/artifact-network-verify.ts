// INT9-A (I-1) · `artifact verify` in three levels, the SDK side.
//
//  - INTEGRITY_VERIFIED  the artifact's own cryptographic and structural integrity, offline, on every network
//                        (mainnet included, offline only). Decided by @hardkas/artifacts, never here.
//  - NETWORK_OBSERVED    the transaction the artifact names is seen by a node of the artifact's network: in that
//                        node's virtual chain (its accepting chain block), its UTXO set (an output of it, unspent), or
//                        its mempool. The level carries the node's identity (type, evidence, trust, sync), where the
//                        observation came from and how far it reached.
//  - CONSENSUS_CONFIRMED inclusion with at least the declared policy's blue-score depth, on a node that says it is
//                        synced. A policy depth, at one observation point, from one node: never irreversible finality.
//  - NOT_CHECKED         the network level when no node was asked (offline), the node did not prove its identity, the
//                        artifact is simulated, or the network is mainnet (never contacted). Never a PASS made up.
// Mempool is never confirmation; a simulator never gives consensus; the observation is never persisted here (this is
// a verification, not evidence collection) and nothing is ever sent.
import type { KaspaRpcClient } from "@hardkas/kaspa-rpc";
import {
  HardkasSchemas,
  deriveObserverId,
  deriveTxStatus,
  TX_STATUS_POLICY_HARDKAS_DEFAULT_V1,
  type TxObservation,
  type TxStatusPolicy
} from "@hardkas/artifacts";
import { isMainnetNetworkId, networkFamilyOf, systemRuntimeContext, type NetworkFamily, type NetworkIdentity } from "@hardkas/core";
import { observeTxOnce, rpcObserverFor } from "./tx-observer.js";

export type ArtifactNetworkLevel = "NETWORK_OBSERVED" | "NOT_OBSERVED" | "NOT_CHECKED";
export type ArtifactConsensusLevel = "CONSENSUS_CONFIRMED" | "NOT_CONFIRMED" | "NOT_CHECKED";

/** Why a level is NOT_CHECKED (or not reached): stable codes. */
export type ArtifactNetworkReason =
  | "OFFLINE"
  | "INTEGRITY_FAILED"
  | "NOT_A_TRANSACTION"
  | "NOT_A_KASPA_L1_NETWORK"
  | "SIMULATED_ARTIFACT"
  | "MAINNET_NETWORK_CHECK_BLOCKED"
  | "NETWORK_ENDPOINT_REQUIRED"
  | "NODE_IDENTITY_UNVERIFIED"
  | "NODE_UNREACHABLE"
  | "NODE_NOT_SYNCED"
  | "OBSERVATION_FAILED"
  | "NOT_FOUND"
  | "MEMPOOL_IS_NOT_CONFIRMATION"
  | "BELOW_POLICY_DEPTH"
  | "ACCEPTING_BLOCK_NOT_LOCATED"
  | "OBSERVATION_CONFLICTS_WITH_ARTIFACT";

/** An output of the artifact's transaction, as the artifact describes it (to look up in a node's UTXO set). */
export interface ArtifactSubjectOutput {
  readonly address: string;
  readonly transactionId: string;
  /** Known only when the artifact says it (a record's outpoint); otherwise any output of the transaction matches. */
  readonly index?: number | undefined;
  readonly amountSompi?: string | undefined;
}

/** What `artifact verify` can check on a network for one artifact (pure, offline). */
export interface ArtifactNetworkSubject {
  readonly schema: string;
  readonly networkId: string;
  readonly family?: NetworkFamily | undefined;
  readonly txId?: string | undefined;
  readonly simulated: boolean;
  readonly outputs: readonly ArtifactSubjectOutput[];
  /** A virtual-chain cursor the artifact itself carries (a submission's submit point). */
  readonly since?: string | undefined;
  /** Why the artifact names no transaction to look for, when it names none. */
  readonly reason?: ArtifactNetworkReason | undefined;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** The transaction (and outputs) an artifact names, by its schema. Nothing is inferred from an address prefix. */
export function artifactNetworkSubject(artifact: unknown): ArtifactNetworkSubject {
  const a = (artifact ?? {}) as Record<string, any>;
  const schema = String(a.schema ?? "");
  const networkId = String(a.networkId ?? "");
  const family = networkFamilyOf(networkId);
  const simulated = family === "simulated" || a.mode === "simulator" || /^synthetic-/.test(String(a.txId ?? a.subject?.txId ?? ""));
  const base = { schema, networkId, ...(family ? { family } : {}), simulated };
  let txId: string | undefined;
  const outputs: ArtifactSubjectOutput[] = [];
  let since: string | undefined;
  switch (schema) {
    case HardkasSchemas.SilverDeployV1:
    case HardkasSchemas.SilverCovenantV1:
      txId = a.txId;
      if (typeof a.address === "string" && a.outpoint) {
        outputs.push({ address: a.address, transactionId: String(a.outpoint.transactionId), index: Number(a.outpoint.index), ...(a.valueSompi ? { amountSompi: String(a.valueSompi) } : {}) });
      }
      break;
    case HardkasSchemas.SilverSpendV1:
      txId = a.txId;
      if (typeof a.to === "string") outputs.push({ address: a.to, transactionId: String(a.txId), index: 0, ...(a.outputSompi ? { amountSompi: String(a.outputSompi) } : {}) });
      break;
    case HardkasSchemas.TxSubmissionV1:
      txId = a.txId;
      if (typeof a.submitPoint?.sinkHash === "string") since = a.submitPoint.sinkHash;
      break;
    case HardkasSchemas.TxReceipt:
    case HardkasSchemas.SignedTx:
      // the payment's recipient output (its index is not recorded: any output of this transaction there, of that amount)
      txId = a.txId;
      if (typeof a.to?.address === "string") {
        outputs.push({ address: a.to.address, transactionId: String(a.txId), ...(typeof a.amountSompi === "string" ? { amountSompi: a.amountSompi } : {}) });
      }
      break;
    case HardkasSchemas.TxObservationV1:
      txId = a.subject?.txId;
      break;
    default:
      return { ...base, outputs: [], reason: "NOT_A_TRANSACTION" };
  }
  if (typeof txId !== "string" || (!HEX64.test(txId) && !simulated)) return { ...base, outputs: [], reason: "NOT_A_TRANSACTION" };
  return { ...base, txId, outputs, ...(since ? { since } : {}) };
}

export interface ArtifactNetworkObservation {
  /** Where the observation came from. */
  readonly source: "virtual-chain" | "utxo-set" | "mempool";
  /** What was read: a sentence for humans; the numbers below for programs. */
  readonly scope: string;
  readonly acceptingBlockHash?: string | undefined;
  readonly confirmationsBlue?: string | undefined;
  /** For a UTXO-set observation: the DAA score of the accepting chain block (the entry's `blockDaaScore`). */
  readonly acceptingDaaScore?: string | undefined;
  readonly point: { readonly virtualDaaScore: string; readonly sinkHash: string; readonly sinkBlueScore: string; readonly pruningPointHash?: string | undefined };
}

export interface ArtifactNetworkVerification {
  readonly schema: "hardkas.artifactNetworkVerification.v1";
  readonly network: {
    readonly level: ArtifactNetworkLevel;
    readonly reason?: ArtifactNetworkReason | undefined;
    readonly message?: string | undefined;
    readonly node?: NetworkIdentity | undefined;
    readonly observation?: ArtifactNetworkObservation | undefined;
  };
  readonly consensus: {
    readonly level: ArtifactConsensusLevel;
    readonly reason?: ArtifactNetworkReason | undefined;
    readonly message?: string | undefined;
    readonly policy: TxStatusPolicy;
    /** What CONSENSUS_CONFIRMED means here, and what it does not. */
    readonly scope: string;
  };
}

export const CONSENSUS_LEVEL_SCOPE =
  "inclusion with at least the policy's blue-score depth, seen by one node that said it was synced, at one observation point: " +
  "a declared confirmation policy, not irreversible finality and not a cryptographic proof";

/** The verification of an artifact that no node was asked about (offline, mainnet, simulated, no endpoint...). */
export function notCheckedNetworkVerification(
  reason: ArtifactNetworkReason,
  message: string,
  options: { policy?: TxStatusPolicy; node?: NetworkIdentity } = {}
): ArtifactNetworkVerification {
  return {
    schema: "hardkas.artifactNetworkVerification.v1",
    network: { level: "NOT_CHECKED", reason, message, ...(options.node ? { node: options.node } : {}) },
    consensus: {
      level: "NOT_CHECKED",
      reason,
      message: reason === "SIMULATED_ARTIFACT" ? "a simulator never gives consensus" : "no network observation, so no confirmation",
      policy: options.policy ?? TX_STATUS_POLICY_HARDKAS_DEFAULT_V1,
      scope: CONSENSUS_LEVEL_SCOPE
    }
  };
}

function utxoEntriesOf(answer: any): Array<{ address?: string; transactionId: string; index: number; amount?: string; blockDaaScore?: string }> {
  const list: any[] = Array.isArray(answer) ? answer : Array.isArray(answer?.entries) ? answer.entries : Array.isArray(answer?.utxos) ? answer.utxos : [];
  return list
    .map((e: any) => {
      const op = e?.outpoint ?? e?.outPoint ?? {};
      const u = e?.utxoEntry ?? e?.utxo_entry ?? e?.entry ?? e ?? {};
      return {
        ...(typeof e?.address === "string" ? { address: e.address } : {}),
        transactionId: String(op.transactionId ?? op.transaction_id ?? e?.transactionId ?? ""),
        index: Number(op.index ?? e?.index ?? -1),
        ...(u.amount !== undefined ? { amount: String(u.amount) } : {}),
        ...(u.blockDaaScore !== undefined || u.block_daa_score !== undefined ? { blockDaaScore: String(u.blockDaaScore ?? u.block_daa_score) } : {})
      };
    })
    .filter((e) => HEX64.test(e.transactionId));
}

/**
 * One look at the node for the artifact's transaction, never persisted, never sending anything. `node` is the identity
 * the caller established for `subject.networkId` (a rusty-kaspad, proven by container or endpoint); anything else is
 * NOT_CHECKED. The caller has already refused mainnet; this refuses it again (nothing is asked).
 */
export async function verifyArtifactOnNetwork(input: {
  readonly subject: ArtifactNetworkSubject;
  readonly client: KaspaRpcClient;
  readonly node: NetworkIdentity;
  readonly policy?: TxStatusPolicy | undefined;
  /** A virtual-chain cursor: a chain block the node holds that precedes the acceptance (default: the artifact's own). */
  readonly since?: string | undefined;
  readonly maxBatches?: number | undefined;
}): Promise<ArtifactNetworkVerification> {
  const { subject, client, node } = input;
  const policy = input.policy ?? TX_STATUS_POLICY_HARDKAS_DEFAULT_V1;
  if (isMainnetNetworkId(subject.networkId) || node.family === "mainnet") {
    return notCheckedNetworkVerification("MAINNET_NETWORK_CHECK_BLOCKED", "HardKAS never contacts a mainnet node: mainnet records are verified offline only", { policy });
  }
  if (subject.simulated) {
    return notCheckedNetworkVerification("SIMULATED_ARTIFACT", "a simulated transaction exists on no network; its only evidence is the simulator's own, labelled as such", { policy });
  }
  if (!subject.txId || subject.reason) {
    return notCheckedNetworkVerification(subject.reason ?? "NOT_A_TRANSACTION", `a ${subject.schema || "?"} artifact names no transaction to look for`, { policy });
  }
  if (node.networkId !== subject.networkId) {
    return notCheckedNetworkVerification("NODE_IDENTITY_UNVERIFIED", `the node was proven for ${node.networkId}, the artifact is for ${subject.networkId}`, { policy, node });
  }
  if (node.nodeType !== "rusty-kaspad") {
    return notCheckedNetworkVerification(
      "NODE_IDENTITY_UNVERIFIED",
      node.nodeType === "simulator"
        ? "the endpoint is the HardKAS simulator, never a node of a real network"
        : `the node did not prove its identity: ${node.problems.join("; ") || "unverified"}`,
      { policy, node }
    );
  }

  const txId = subject.txId;
  const look = (since: string | undefined) =>
    observeTxOnce(
      rpcObserverFor(client),
      {
        txId,
        observerId: deriveObserverId({ kind: "rpc", target: subject.networkId, ...(node.endpoint ? { locator: node.endpoint } : {}) }),
        ...(since ? { since } : {}),
        ...(input.since !== undefined ? { sinceExplicit: true } : {}),
        ...(input.maxBatches !== undefined ? { maxBatches: input.maxBatches } : {}),
        networkId: subject.networkId as TxObservation["networkId"],
        mode: "rpc"
      },
      systemRuntimeContext
    );
  let observation: TxObservation;
  try {
    try {
      observation = await look(input.since ?? subject.since);
    } catch (e) {
      // the artifact's own cursor (a submission's submit point) may be pruned by now: that says nothing about the
      // transaction, so the look is made again from the node's pruning point. An explicit --since is never replaced.
      if (input.since !== undefined || subject.since === undefined) throw e;
      observation = await look(undefined);
    }
  } catch (e: unknown) {
    const err = e as { code?: unknown; message?: unknown } | null | undefined;
    const message = `the look failed: ${err?.code ? `[${String(err.code)}] ` : ""}${String(err?.message ?? e)}`;
    return {
      ...notCheckedNetworkVerification("OBSERVATION_FAILED", message, { policy, node }),
      network: { level: "NOT_CHECKED", reason: "OBSERVATION_FAILED", message, node }
    };
  }
  const point = {
    virtualDaaScore: observation.point.virtualDaaScore,
    sinkHash: observation.point.sinkHash,
    sinkBlueScore: observation.point.sinkBlueScore,
    ...(observation.point.pruningPointHash ? { pruningPointHash: observation.point.pruningPointHash } : {})
  };
  const synced = node.sync === "synced";
  const consensusFor = (blue: bigint, basis: string) =>
    !synced
      ? {
          level: "NOT_CONFIRMED" as const,
          reason: "NODE_NOT_SYNCED" as const,
          message: `the node ${node.sync === "not-synced" ? "says it is not synced" : "did not say it is synced"}: its depth is not a confirmation`
        }
      : blue >= BigInt(policy.minConfirmations)
        ? { level: "CONSENSUS_CONFIRMED" as const, message: `${basis}: ${blue} ≥ ${policy.minConfirmations} blue-score confirmations` }
        : { level: "NOT_CONFIRMED" as const, reason: "BELOW_POLICY_DEPTH" as const, message: `${basis}: ${blue} < ${policy.minConfirmations} blue-score confirmations` };

  const derived = deriveTxStatus({ txId, observations: [observation], policy });
  const finding: any = observation.finding;
  if (finding.type === "chain_accepted" || finding.type === "finality_reached") {
    const blue = BigInt(finding.confirmationsBlue ?? "0");
    const c = consensusFor(blue, `accepting chain block ${finding.acceptingBlockHash}`);
    return {
      schema: "hardkas.artifactNetworkVerification.v1",
      network: {
        level: "NETWORK_OBSERVED",
        node,
        observation: {
          source: "virtual-chain",
          scope: `accepted in the node's virtual chain by ${finding.acceptingBlockHash} (derived ${derived.status}); one node, one look`,
          acceptingBlockHash: finding.acceptingBlockHash,
          confirmationsBlue: blue.toString(),
          point
        }
      },
      consensus: { ...c, policy, scope: CONSENSUS_LEVEL_SCOPE }
    };
  }

  // Not located in the virtual chain window the look read: the node's UTXO set can still show an output of it.
  const utxoHit = await (async () => {
    for (const out of subject.outputs) {
      let answer: any;
      try {
        answer = await client.getUtxosByAddresses([out.address]);
      } catch {
        continue;
      }
      const hits = utxoEntriesOf(answer).filter((e) => e.transactionId === out.transactionId && (out.index === undefined || e.index === out.index));
      // an output of the stated amount when the artifact states one (a change output may share the address)
      const hit = (out.amountSompi !== undefined ? hits.find((e) => e.amount === out.amountSompi) : undefined) ?? hits[0];
      if (hit) return { out, hit };
    }
    return undefined;
  })();
  if (utxoHit) {
    const { out, hit } = utxoHit;
    if (out.amountSompi !== undefined && hit.amount !== undefined && out.amountSompi !== hit.amount) {
      return {
        schema: "hardkas.artifactNetworkVerification.v1",
        network: {
          level: "NOT_OBSERVED",
          reason: "OBSERVATION_CONFLICTS_WITH_ARTIFACT",
          message: `${out.transactionId}:${hit.index} holds ${hit.amount} sompi at the node, the artifact says ${out.amountSompi}`,
          node
        },
        consensus: { level: "NOT_CONFIRMED", reason: "OBSERVATION_CONFLICTS_WITH_ARTIFACT", policy, scope: CONSENSUS_LEVEL_SCOPE }
      };
    }
    // Consensus by a sound lower bound only: an accepting chain block whose DAA score is below the pruning point's
    // precedes it on the selected chain, so its blue-score depth is at least sink − pruning point.
    let consensus: ArtifactNetworkVerification["consensus"] = {
      level: "NOT_CONFIRMED",
      reason: "ACCEPTING_BLOCK_NOT_LOCATED",
      message: "the UTXO set gives the accepting block's DAA score, not its blue score: locate it in the virtual chain (--since a chain block before the acceptance) to count confirmations",
      policy,
      scope: CONSENSUS_LEVEL_SCOPE
    };
    if (hit.blockDaaScore !== undefined && point.pruningPointHash) {
      try {
        const pp = await rpcObserverFor(client).rpc.getBlockHeader(point.pruningPointHash);
        if (pp && BigInt(hit.blockDaaScore) < pp.daaScore) {
          const bound = BigInt(point.sinkBlueScore) - pp.blueScore;
          consensus = { ...consensusFor(bound, `accepting chain block below the pruning point ${point.pruningPointHash} (depth lower bound)`), policy, scope: CONSENSUS_LEVEL_SCOPE };
        }
      } catch {
        // the bound is unavailable: the level stays NOT_CONFIRMED with its reason
      }
    }
    return {
      schema: "hardkas.artifactNetworkVerification.v1",
      network: {
        level: "NETWORK_OBSERVED",
        node,
        observation: {
          source: "utxo-set",
          scope: `output ${hit.transactionId}:${hit.index} is in the node's UTXO set at ${out.address} (accepted, still unspent)`,
          ...(hit.blockDaaScore !== undefined ? { acceptingDaaScore: hit.blockDaaScore } : {}),
          point
        }
      },
      consensus
    };
  }

  if (finding.type === "mempool_entry") {
    return {
      schema: "hardkas.artifactNetworkVerification.v1",
      network: {
        level: "NETWORK_OBSERVED",
        node,
        observation: { source: "mempool", scope: `in the node's mempool${finding.isOrphan ? " (orphan)" : ""}: local and transient`, point }
      },
      consensus: { level: "NOT_CONFIRMED", reason: "MEMPOOL_IS_NOT_CONFIRMATION", message: "mempool is not confirmation", policy, scope: CONSENSUS_LEVEL_SCOPE }
    };
  }

  const window =
    finding.type === "not_found"
      ? `not in the node's mempool, not in the virtual chain it read${finding.scannedFrom ? ` from ${finding.scannedFrom}` : ""} (${finding.scannedChainBlocks ?? 0} chain blocks)` +
        `${subject.outputs.length ? ", no output of it in the UTXO set" : ""}`
      : `${finding.type}${finding.reason ? `: ${finding.reason}` : ""}`;
  return {
    schema: "hardkas.artifactNetworkVerification.v1",
    network: { level: "NOT_OBSERVED", reason: "NOT_FOUND", message: window, node },
    consensus: { level: "NOT_CONFIRMED", reason: "NOT_FOUND", policy, scope: CONSENSUS_LEVEL_SCOPE }
  };
}
