import {
  systemRuntimeContext,
  deterministicCompare,
  getCoinbaseMaturity,
  HardkasError,
  assertMainnetTransactionsDisabled,
  declaredNetworkIdOf,
  stripBom,
  redactUrlCredentials,
  redactUrlCredentialsInText
} from "@hardkas/core";
import { pollCondition } from "./waiters.js";
import { Hardkas } from "./index.js";
import {
  assertBroadcastNodeIdentity,
  isNodeNetworkIdentityError,
  isRpcRequestNotSentError,
  markRequestNotSent,
  officialTxIdOf,
  rpcEndpointOf,
  RpcSubmitOutcomeUnknownError,
  sameRpcEndpoint
} from "@hardkas/kaspa-rpc";
import { networkEndpointRequiredError } from "@hardkas/config";

/**
 * EXPECTED-TXID-1: the TXID a real send is made under — the signed artifact's, provided it is the id the official
 * kaspa-wasm computes for the payload being sent. Refused before any request or record otherwise: no TXID declared, a
 * payload whose id cannot be computed (no HardKAS client could send it), or a TXID that is not the payload's.
 */
function signedTxIdToSend(signedArtifact: { txId?: unknown }, rawTransaction: unknown): string {
  const declared = signedArtifact.txId;
  if (typeof declared !== "string" || !/^[0-9a-f]{64}$/.test(declared)) {
    throw new HardkasError(
      "SIGNED_TXID_UNVERIFIABLE",
      "Refusing to broadcast: the signed artifact declares no transaction id (64 lowercase hex) to send it under. Nothing was sent or recorded."
    );
  }
  let official: string;
  try {
    official = officialTxIdOf(rawTransaction);
  } catch (e) {
    throw new HardkasError(
      "SIGNED_TXID_UNVERIFIABLE",
      `Refusing to broadcast: the official id of the signed payload cannot be computed to check txId ${declared} ` +
        `(${e instanceof Error ? e.message : String(e)}). Nothing was sent or recorded.`
    );
  }
  if (official !== declared) {
    throw new HardkasError(
      "SIGNED_TXID_MISMATCH",
      `Refusing to broadcast: the signed artifact declares txId ${declared}, but its payload is transaction ${official} ` +
        "(official kaspa-wasm id). Nothing was sent or recorded."
    );
  }
  return official;
}

/** TESTNET-PORT-COLLISION-1: the instance's client stands for "no endpoint chosen" (see unresolved-endpoint-rpc.ts). */
function refuseUnresolvedEndpoint(sdk: Hardkas): void {
  if ((sdk.rpc as { endpointUnresolved?: unknown } | undefined)?.endpointUnresolved === true) {
    throw networkEndpointRequiredError(String(sdk.network));
  }
}

/**
 * ENDPOINT-AUTHORITY-1 (EA-I1/EA-I2): the endpoint of the client that carries an operation is the only endpoint a
 * record may name. An explicit endpoint must BE that client's (same effective destination); when the client does not
 * say which endpoint it talks to, an explicit one cannot be shown to match and is refused. Decided before any request.
 */
function endpointAuthority(rpc: unknown, explicit: string | undefined, operation: "SEND" | "OBSERVE"): string | undefined {
  const own = rpcEndpointOf(rpc);
  if (explicit === undefined) return own;
  const verb = operation === "SEND" ? "send to" : "observe through";
  if (own === undefined) {
    throw new HardkasError(
      `${operation}_ENDPOINT_UNVERIFIABLE`,
      `Cannot ${verb} ${redactUrlCredentials(explicit)}: this instance's RPC client does not say which endpoint it talks to, ` +
        `so the request could not be shown to go there. Nothing was sent or recorded.`
    );
  }
  if (!sameRpcEndpoint(explicit, own)) {
    throw new HardkasError(
      `${operation}_ENDPOINT_MISMATCH`,
      `Cannot ${verb} ${redactUrlCredentials(explicit)}: this instance's RPC client talks to ${redactUrlCredentials(own)}, ` +
        `and HardKAS never records one endpoint for a request another one received. Open the instance on that endpoint. ` +
        `Nothing was sent or recorded.`
    );
  }
  return own;
}

/** Options of `tx.send` given as an object (the string form is the endpoint alone). */
export interface SendTxOptions {
  /** The endpoint to send to: it must be this instance's client's (ENDPOINT-AUTHORITY-1). */
  url?: string;
  /** Simulator: write the receipt (default true). */
  persist?: boolean;
  /**
   * Simulator: the signed artifact's plan, when the store does not hold it (used only if its recomputed identity is the
   * signed artifact's lineage parent). A real send reads the plan from the workspace store only.
   */
  plan?: TxPlanArtifact;
  /**
   * F1.6 · explicit replacement of a pending transition of the same covenant: the artifactId(s) of its recorded
   * submission(s). Allowed only for a transaction that spends one of the replaced transition's covenant outpoints; the
   * new record names what it replaced. Never automatic.
   */
  replacePendingTransition?: string | readonly string[];
  /** F1.6 · where a v1 send gets its contract facts (default: this workspace's compile records and the pinned silverc). */
  v1Facts?: V1EngineFacts;
  /**
   * PAYMENT-PREFLIGHT-1 · opt-in, for a payment (not a v1 engine transaction, which always runs its own check): right
   * before the broadcast, read-only, the node is asked for every input (unspent, as the plan states it, no covenant id,
   * not pending in its mempool) and each input's Schnorr signature (SIGHASH_ALL) is verified for the transaction sent
   * against the node's UTXO entry. Anything it cannot verify refuses the send; nothing is sent or recorded then. The
   * submission records the check (`preflight`). One node's view, not a consensus validation. Default false: unchanged.
   */
  preflight?: boolean;
}

/** The version a signed payload declares (0 when it says none or cannot be read). */
function payloadVersionOf(rawTransaction: unknown): number {
  let tx: any = rawTransaction;
  for (let depth = 0; typeof tx === "string" && depth < 3; depth++) {
    try {
      tx = JSON.parse(tx);
    } catch {
      return 0;
    }
  }
  return Number(tx?.version ?? tx?.tx?.inner?.version ?? 0) || 0;
}

/** A plan field only the v1 engine writes (inputs' kind, bindings, genesis groups, next state, covenant outpoints). */
function hasV1EngineFields(plan: any): boolean {
  return (
    (Array.isArray(plan?.inputs) && plan.inputs.some((i: any) => i?.kind !== undefined || i?.contract !== undefined || i?.computeBudget !== undefined)) ||
    (Array.isArray(plan?.outputs) && plan.outputs.some((o: any) => o?.covenant !== undefined || o?.role !== undefined)) ||
    plan?.genesisCovenantGroups !== undefined ||
    plan?.nextState !== undefined ||
    plan?.covenantOutpoints !== undefined
  );
}

/** Whether a signed payload binds any output to a covenant. */
function payloadHasCovenantBindings(rawTransaction: unknown): boolean {
  let tx: any = rawTransaction;
  for (let depth = 0; typeof tx === "string" && depth < 3; depth++) {
    try {
      tx = JSON.parse(tx);
    } catch {
      return false;
    }
  }
  const outputs: any[] = Array.isArray(tx?.outputs) ? tx.outputs : Array.isArray(tx?.tx?.inner?.outputs) ? tx.tx.inner.outputs : [];
  return outputs.some((o) => o?.covenant !== undefined && o?.covenant !== null);
}

/** An engine error's message without its leading "CODE: " (the code travels as the HardkasError code). */
function withoutCode(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.replace(/^[A-Z][A-Z0-9_]+:\s*/, "");
}
import {
  Utxo as BuilderUtxo,
  verifySignedTxSemantics
} from "@hardkas/tx-builder";
import {
  ARTIFACT_SCHEMAS,
  CURRENT_HASH_VERSION,
  calculateContentHash,
  SignedTxArtifact,
  TxReceiptArtifact,
  TxSubmissionArtifact,
  TxPlanArtifact,
  getDefaultReceiptPath,
  writeArtifact,
  createLineageTransition,
  createTxPlanArtifact,
  readTxReceiptArtifact,
  HARDKAS_VERSION,
  ARTIFACT_VERSION,
  getBroadcastableSignedTransaction,
  syntheticTxIdFor,
  checkSyntheticAuthorization,
  authorizablePlanIdentity,
  SYNTHETIC_AUTHORIZATION_FORMAT,
  deriveSubmissionFee,
  deriveTxStatus,
  deriveObserverId,
  submitOutcomeOf,
  TX_STATUS_POLICY_HARDKAS_DEFAULT_V1,
  type DerivedTxStatus,
  type TxStatusPolicy,
  type TxObservation
} from "@hardkas/artifacts";
import { observeTxOnce, rpcObserverFor } from "./tx-observer.js";
import { preflightPaymentSend } from "./payment-preflight.js";
import {
  coreEvents,
  createEventEnvelope,
  emitArtifactWritten,
  rethrowWithLedgerEffect,
  STANDALONE_WORKFLOW_ID,
  asArtifactId,
  asCorrelationId,
  asEventSequence,
  asNetworkId,
  asRpcEndpointId,
  asTxId,
  asWorkflowId,
  withLock,
  withLocks
} from "@hardkas/core";
import {
  HardkasAccount,
  assertAccountCompatible,
  signTxPlanArtifact,
  validateAddressNetwork,
  checkSignedV1AgainstPlan,
  createWorkspaceV1Facts,
  preflightV1Send,
  v1CovenantSpendsOf,
  v1NodeUtxoOf,
  type V1EngineFacts,
  type V1PreflightNode
} from "@hardkas/accounts";
import { assertV1PlanShape, observePendingSpends } from "@hardkas/tx-builder";
import { enumerateWorkspaceArtifactsSync, nodeRejectionOf, type NodeRejection } from "@hardkas/artifacts";
import {
  parseKasToSompi,
  parseFeeRate,
  parseMaxFeeSompi,
  effectiveFeeLimit,
  assertFeeWithinLimit,
  planPaysFeeSompi,
  type NetworkId
} from "@hardkas/core";
import { TxPlanService, covenantIdOf, type UtxoProvider } from "@hardkas/tx-builder";
import { HardkasSchemas } from "@hardkas/artifacts";

/** An artifact's identity: its declared 64-hex contentHash, or the hash of its body when it declares none. */
function artifactIdentity(artifact: any): string {
  return typeof artifact?.contentHash === "string" && /^[0-9a-f]{64}$/.test(artifact.contentHash)
    ? artifact.contentHash
    : calculateContentHash(artifact, CURRENT_HASH_VERSION);
}

function normalizeSimulatedPlanInput(target: any, fallbackId: string): TxPlanArtifact {
  if (target.schema === ARTIFACT_SCHEMAS.TX_PLAN && Array.isArray(target.inputs)) {
    return target as TxPlanArtifact;
  }

  if (target.from && target.to && target.amountSompi) {
    if (target.mode !== "simulator") {
      throw new Error(
        "Cannot simulate real signed artifact without parent plan. Missing plan inputs data."
      );
    }

    return {
      schema: ARTIFACT_SCHEMAS.TX_PLAN,
      planId: target.planId || target.sourcePlanId || fallbackId,
      networkId: target.networkId || "simnet",
      mode: "simulator",
      from: target.from,
      to: target.to,
      amountSompi: target.amountSompi,
      estimatedFeeSompi: "0",
      estimatedMass: "0",
      inputs: [],
      outputs: [{ address: target.to.address, amountSompi: target.amountSompi || "0" }],
      plan: {
        inputs: [],
        outputs: [
          { address: target.to.address, amountSompi: BigInt(target.amountSompi || 0) }
        ],
        feeSompi: 0n,
        mass: 0n,
        changeSompi: 0n
      }
    } as any;
  }

  throw new Error(
    "Cannot simulate signed artifact without parent plan or embedded plan data."
  );
}

/**
 * HardKAS Transaction Module
 * @alpha
 */
export interface SignTxOptions {
  account?: HardkasAccount | string;
  authorizers?: Record<number, any>; // Record<number, TxInputAuthorizer>
  append?: boolean;
  threshold?: number;
  requiredSigners?: string[];
  /**
   * Wave 1.2 · IC-5′.6: when appending to a partially signed artifact whose parent
   * plan is not persisted, the plan object may be supplied; it is accepted only if
   * its recomputed identity is the artifact's `lineage.parentArtifactId`.
   */
  plan?: TxPlanArtifact;
  /**
   * The password of the signing account's encrypted keystore. Kept in memory for this call only:
   * never stored, logged or written into any artifact. A development account needs none.
   */
  keystorePassword?: string;
}

/**
 * @deprecated Use SignTxOptions instead
 */
export interface LegacySignTxOptions {
  append?: boolean;
  threshold?: number;
  requiredSigners?: string[];
  authorizers?: any;
  /** See SignTxOptions.keystorePassword. */
  keystorePassword?: string;
}

function isSignTxOptions(value: unknown): value is SignTxOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    ("authorizers" in value ||
      "account" in value ||
      "requiredSigners" in value ||
      "keystorePassword" in value)
  );
}

/**
 * MEMPOOL-CHAIN-PRECEDENCE-FIX-1: the observer's cursor never moves past chain that a look did not read. Walking the
 * history back from the latest look (in deriveTxStatus order), the cursor is the first position one of them verified:
 *  - a scan window's last chain block (`not_found`, or a `mempool_entry` that also read the chain): `scannedTo`;
 *  - a scan that read no block past its start (`not_found` without `scannedTo`): that start;
 *  - after the accepting block left the chain, that block (the node answers from the common ancestor, so a later
 *    re-acceptance anywhere on the new chain stays reachable; the removal look's sink could already be past it).
 * A look's sink is not such a position: a historical `mempool_entry` (no window), a pruned or accepting look never read
 * the chain up to it. `undefined` when no look verified one.
 */
/**
 * TX-SEND-SUBMITPOINT-1: where the virtual was just before a submission, from ONE view of the chain — the sink the node
 * names (getBlockDagInfo, with that same answer's virtual DAA score) and THAT block's own blue score, read from its
 * header. The former pair (getBlockDagInfo + getSinkBlueScore) could join a sink with a later sink's blue score, and a
 * client without getSinkBlueScore (the CLI's KaspaWrpcClient) lost the whole point without a word. It reads through the
 * generic `call` every HardKAS RPC client exposes. Any failure is returned as a reason, never as an invented point.
 */
async function captureSubmitPoint(
  client: any
): Promise<
  | { submitPoint: { virtualDaaScore: string; sinkHash: string; sinkBlueScore: string } }
  | { submitPointUnavailable: { reason: string } }
> {
  const unavailable = (reason: string) => ({ submitPointUnavailable: { reason } });
  const messageOf = (e: unknown) => redactUrlCredentialsInText(e instanceof Error ? e.message : String(e));
  if (typeof client?.call !== "function") return unavailable("the RPC client cannot read the chain position (it has no generic call)");
  let dag: any;
  try {
    const raw: any = await client.call("getBlockDagInfo", {});
    dag = raw?.getBlockDagInfoResponse ?? raw;
  } catch (e) {
    return unavailable(`reading the sink (getBlockDagInfo) failed: ${messageOf(e)}`);
  }
  const sinkHash = typeof dag?.sink === "string" ? dag.sink : typeof dag?.sinkHash === "string" ? dag.sinkHash : "";
  if (!/^[0-9a-f]{64}$/.test(sinkHash)) return unavailable("the node's getBlockDagInfo named no sink hash");
  if (dag?.virtualDaaScore === undefined || dag?.virtualDaaScore === null) return unavailable("the node's getBlockDagInfo gave no virtual DAA score");
  let header: any;
  try {
    const raw: any = await client.call("getBlock", { hash: sinkHash, includeTransactions: false });
    header = raw?.block?.header ?? raw?.getBlockResponse?.block?.header ?? raw?.header;
  } catch (e) {
    return unavailable(`reading the sink's header (getBlock ${sinkHash}) failed: ${messageOf(e)}`);
  }
  if (typeof header?.hash === "string" && header.hash !== sinkHash) {
    return unavailable(`the node's getBlock answered another block's header (${header.hash}) for the sink ${sinkHash}`);
  }
  if (header?.blueScore === undefined || header?.blueScore === null) return unavailable(`the node's getBlock gave no header blue score for the sink ${sinkHash}`);
  try {
    return {
      submitPoint: { virtualDaaScore: BigInt(dag.virtualDaaScore).toString(), sinkHash, sinkBlueScore: BigInt(header.blueScore).toString() }
    };
  } catch (e) {
    return unavailable(`the node's chain position is not numeric: ${messageOf(e)}`);
  }
}

function verifiedCursor(history: readonly any[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const f = history[i]?.finding;
    if (!f) continue;
    if ((f.type === "not_found" || f.type === "mempool_entry") && typeof f.scannedTo === "string") return f.scannedTo;
    if (f.type === "not_found" && typeof f.scannedFrom === "string") return f.scannedFrom;
    if (f.type === "chain_removed" && typeof f.acceptingBlockHash === "string") return f.acceptingBlockHash;
  }
  return undefined;
}

/**
 * TX-SEND-IDEMPOTENT-1: how long a send waits for another send of the same transaction to finish (its broadcast and its
 * record) before giving up, nothing sent.
 */
const TX_SEND_LOCK_WAIT_MS = 180_000;
/** TX-SEND-IDEMPOTENT-1: derived states in which the observed node holds the transaction (mempool or chain). */
const NODE_HOLDS_TX = new Set<DerivedTxStatus["status"]>(["MEMPOOL_ACCEPTED", "MEMPOOL_ORPHAN", "ACCEPTED", "CONFIRMED", "FINALIZED"]);

export class HardkasTx {
  constructor(private sdk: Hardkas) {}

  /**
   * Wave 2(a) · Q4 / IC-2′: ONE look at the configured node about `txId`, sealed and
   * (by default) persisted as `hardkas.txObservation.v1`. The observer's cursor is,
   * in order: `since`, the latest position a stored look verified (`verifiedCursor`), the
   * submission's `submitPoint.sinkHash`, the node's pruning point. Nothing here decides a state.
   *
   * TN10-CONFIRMATION-FIX-1: an explicit `since` (a 64-hex chain block hash the caller knows precedes the acceptance)
   * lets a transaction sent outside this workspace — no submission recorded here — be observed without inventing a
   * receipt. When the node cannot serve the chain from it, `OBSERVE_SINCE_UNAVAILABLE` is thrown and nothing is sealed.
   */
  async observe(
    txId: string,
    options: { since?: string; maxBatches?: number; persist?: boolean; rpcUrl?: string; policy?: TxStatusPolicy } = {}
  ): Promise<{ observation: TxObservation; observationPath?: string; derived: DerivedTxStatus }> {
    if (/^synthetic-[0-9a-f]{64}$/.test(txId)) {
      throw new HardkasError(
        "OBSERVATION_SYNTHETIC_TXID",
        `${txId} is a synthetic (simulator) txId: there is no network to observe; its state derives from the simulator receipt`
      );
    }
    if (options.since !== undefined && !/^[0-9a-f]{64}$/.test(options.since)) {
      throw new HardkasError(
        "OBSERVE_SINCE_INVALID",
        `since must be a 64-hex chain block hash, got '${String(options.since).slice(0, 80)}'. Nothing was observed.`
      );
    }
    const { ProjectArtifactStore } = await import("@hardkas/artifacts");
    // TESTNET-PORT-COLLISION-1: an instance whose public network has no endpoint the user chose observes nothing
    refuseUnresolvedEndpoint(this.sdk);
    // ENDPOINT-AUTHORITY-1 (EA-I1/EA-I2): the observation is the observing client's; an explicit endpoint must be it
    const endpoint = endpointAuthority(this.sdk.rpc, options.rpcUrl, "OBSERVE");
    const store = new ProjectArtifactStore(this.sdk.workspace.root);
    const submission = await this.findSubmissionForTxId(txId);
    const previous = store.listObservationsByTxId(txId).observations as any[];
    // The same order deriveTxStatus reads a history in: point, then time, then id (two looks at one
    // sink are not interchangeable — the later one holds the cursor).
    previous.sort((a, b) => {
      const pa = BigInt(a.point.sinkBlueScore);
      const pb = BigInt(b.point.sinkBlueScore);
      if (pa !== pb) return pa < pb ? -1 : 1;
      if (a.observedAt !== b.observedAt) return a.observedAt < b.observedAt ? -1 : 1;
      return a.contentHash < b.contentHash ? -1 : a.contentHash > b.contentHash ? 1 : 0;
    });
    // The block currently established as accepting (none after a REORGED derivation).
    const soFar = deriveTxStatus({ txId, ...(submission ? { submission } : {}), observations: previous });
    const currentAccepting =
      soFar.status === "ACCEPTED" || soFar.status === "CONFIRMED" || soFar.status === "FINALIZED" ? soFar.acceptingBlockHash : undefined;
    // Cursor: an explicit `since`, else the latest position a look actually verified (see
    // `verifiedCursor`), else the submit point; the observer falls back to the pruning point.
    const since = options.since ?? verifiedCursor(previous) ?? ((submission as any)?.submitPoint?.sinkHash as string | undefined);
    const networkId = ((submission as any)?.networkId ?? this.sdk.network) as TxObservation["networkId"];
    const mode = ((submission as any)?.mode ?? "rpc") as TxObservation["mode"];

    let observation = await observeTxOnce(
      rpcObserverFor(this.sdk.rpc),
      {
        txId,
        observerId: this.observerId(),
        ...(submission?.contentHash ? { submissionArtifactId: submission.contentHash as string } : {}),
        ...(since ? { since } : {}),
        ...(options.since !== undefined ? { sinceExplicit: true } : {}),
        ...(currentAccepting ? { previousAcceptingBlockHash: currentAccepting } : {}),
        ...(options.maxBatches !== undefined ? { maxBatches: options.maxBatches } : {}),
        networkId,
        mode,
        ...((submission as any)?.execution ? { execution: (submission as any).execution } : {}),
        ...(endpoint ? { rpcUrl: endpoint } : {}),
        ...((submission as any)?.workflowId ? { workflowId: (submission as any).workflowId } : {}),
        ...((submission as any)?.assumptionLevel ? { assumptionLevel: (submission as any).assumptionLevel } : {})
      },
      systemRuntimeContext
    );
    let observationPath: string | undefined;
    if (options.persist ?? true) {
      // EVIDENCE-TRUST-1 (D2): an observation already published under this identity is returned as stored.
      const written = await this.sdk.artifacts.write(observation as any);
      observationPath = written.absolutePath;
      if (written.artifact) observation = written.artifact;
    }
    const derived = deriveTxStatus({
      txId,
      ...(submission ? { submission } : {}),
      observations: [...previous, observation],
      ...(options.policy ? { policy: options.policy } : {})
    });
    return { observation, ...(observationPath ? { observationPath } : {}), derived };
  }

  /**
   * The opaque, stable identity of THIS SDK instance's RPC observer: a digest of the
   * configured target and its raw locator (never exposed). Same configuration ⇒ same
   * observer ⇒ one history; a different node configuration is a different observer.
   */
  observerId(): string {
    const target = this.sdk.network as string;
    // ENDPOINT-AUTHORITY-1 (EA-I1): the observer is the client that observes (its endpoint), not the configuration's
    // endpoint — they differ once a client is swapped in (as the CLI's tx send / consolidate do). The SDK opens its
    // own client on the configured rpcUrl, so for an unswapped instance the identity is unchanged.
    const locator = rpcEndpointOf(this.sdk.rpc);
    return deriveObserverId({ kind: "rpc", target, ...(locator !== undefined ? { locator } : {}) });
  }

  /** The verified submission (or simulator receipt) recorded for `txId`, if exactly one exists. */
  private async findSubmissionForTxId(txId: string): Promise<any | undefined> {
    try {
      return await this.sdk.artifacts.read({ tx: txId });
    } catch (e: any) {
      if (e?.code === "RECEIPT_AMBIGUOUS_CONFLICT" || e?.code === "CANDIDATE_INVALID") throw e;
      return undefined;
    }
  }

  /**
   * Waits until the derived state is `ACCEPTED` (or deeper): observed acceptance by a
   * chain block. Each poll persists ONE observation; the state is derived, never stored.
   */
  async waitForAccepted(options: {
    txId: string;
    timeoutMs?: number | undefined;
    pollIntervalMs?: number | undefined;
    signal?: AbortSignal | undefined;
  }) {
    return pollCondition(
      async () => {
        const { derived } = await this.observe(options.txId);
        if (derived.status === "ACCEPTED" || derived.status === "CONFIRMED" || derived.status === "FINALIZED") {
          return {
            ok: true,
            value: {
              status: "accepted",
              txId: options.txId,
              acceptingBlockHash: derived.acceptingBlockHash,
              confirmations: Number(derived.confirmations?.blue ?? 0),
              derived
            },
            lastObservedState: { status: derived.status }
          };
        }
        return { ok: false, lastObservedState: { status: derived.status, txId: options.txId } };
      },
      "TX_ACCEPTANCE_TIMEOUT",
      "Timeout waiting for transaction acceptance",
      options
    );
  }

  /**
   * Waits until the observed blue-score depth of the accepting block reaches
   * `minConfirmations` (Q4 point 3: `sinkBlueScore − acceptingBlueScore`, the node's
   * own unit). `minConfirmations` is the caller's policy, not a Kaspa parameter.
   */
  async waitForConfirmations(options: {
    txId: string;
    minConfirmations: number;
    timeoutMs?: number | undefined;
    pollIntervalMs?: number | undefined;
    signal?: AbortSignal | undefined;
  }) {
    const policy: TxStatusPolicy = {
      ...TX_STATUS_POLICY_HARDKAS_DEFAULT_V1,
      policyId: "hardkas.txStatusPolicy.caller",
      origin: "user",
      minConfirmations: options.minConfirmations
    };
    return pollCondition(
      async () => {
        const { derived, observation } = await this.observe(options.txId, { policy });
        const confirmations = derived.confirmations ? Number(derived.confirmations.blue) : undefined;
        if (
          derived.status === "FINALIZED" ||
          ((derived.status === "CONFIRMED" || derived.status === "ACCEPTED") &&
            confirmations !== undefined &&
            BigInt(derived.confirmations!.blue) >= BigInt(policy.minConfirmations))
        ) {
          return {
            ok: true,
            value: {
              status: "confirmed",
              confirmations,
              confirmationUnit: "blue-score",
              acceptingBlockHash: derived.acceptingBlockHash,
              observedAtDaaScore: observation.point.virtualDaaScore,
              derived
            },
            lastObservedState: { status: derived.status, confirmations, required: options.minConfirmations }
          };
        }
        return {
          ok: false,
          lastObservedState: { status: derived.status, ...(confirmations !== undefined ? { confirmations } : {}), required: options.minConfirmations }
        };
      },
      "TX_CONFIRMATION_TIMEOUT",
      "Timeout waiting for transaction confirmations",
      options
    );
  }

  /**
   * Plans a transaction.
   */
  async plan(options: {
    from: string | HardkasAccount;
    to: string | HardkasAccount;
    amount: string | number | bigint;
    feeRate?: bigint;
    /**
     * TX-FEE-GUARD-1: the most this transaction may pay in total, in sompi. Refused with FEE_EXCEEDS_MAX when the
     * planned fee is above it (or above the workspace's `networks[<net>].maxFeeSompi`, the lower one applies); recorded
     * in the plan and enforced again at sign and send. Optional: without it (and without a network limit) no limit is
     * imposed.
     */
    maxFeeSompi?: bigint | number | string;
    workflowId?: string;
    policy?: string;
    networkProfile?: string;
    assumption?: string;
    /** AUD-28: explicit change destination; default = the sender's address. Validated, then forwarded to the planner. */
    changeAddress?: string;
  }): Promise<TxPlanArtifact> {
    // TX-FEE-GUARD-1: a fee rate, when given, is a positive integer (INVALID_FEE_RATE); a plan limit is a positive
    // integer of sompi (INVALID_MAX_FEE). Decided before anything is read or planned.
    if (options.feeRate !== undefined) parseFeeRate(options.feeRate, "tx.plan feeRate");
    const planMaxFeeSompi = options.maxFeeSompi === undefined ? undefined : parseMaxFeeSompi(options.maxFeeSompi, "tx.plan maxFeeSompi");
    // WORKSPACE-AUTHORITY-2 (WA2-I2): the identities and the world of a plan come from the ONE resolved execution target
    // of this instance, and their compatibility is decided before any plan exists — the CLI's rule, shared from
    // @hardkas/accounts (`assertAccountCompatible`), never a world-mixing artifact caught later by the signer.
    const world = this.sdk.execution;
    const fromAccount =
      typeof options.from === "string"
        ? await this.sdk.accounts.resolve(options.from, world)
        : options.from;
    const toAccount =
      typeof options.to === "string"
        ? await this.sdk.accounts.resolve(options.to, world)
        : options.to;
    assertAccountCompatible(fromAccount, world);
    assertAccountCompatible(toAccount, world);

    if (!fromAccount.address)
      throw new Error(`From account ${fromAccount.name} has no address.`);
    if (!toAccount.address)
      throw new Error(`To account ${toAccount.name} has no address.`);

    const activeNetwork = options.networkProfile || (this.sdk.network as string);
    // the world of this plan: the resolved execution target's mode when planning on this instance's network (the
    // authority; a `{ mode: "simulator", network: "simnet" }` target is the simulator whatever the label says), else
    // what the explicit network's declaration implies
    const simulatedWorld =
      activeNetwork === (this.sdk.network as string)
        ? this.sdk.execution.mode === "simulator"
        : activeNetwork === "simulated" || this.sdk.config.config.networks?.[activeNetwork]?.kind === "simulated";

    if (typeof options.amount === "string" && options.amount.toLowerCase() === "all") {
      const res = await this.sdk.query.getSpendableUtxos({ address: fromAccount.address, excludePending: true });
      return this.createConsolidationPlan({
         account: fromAccount,
         selectedUtxos: res.data,
         destination: toAccount.address,
         network: activeNetwork,
         ...(options.feeRate !== undefined ? { feeRate: options.feeRate } : {}),
         ...(planMaxFeeSompi !== undefined ? { maxFeeSompi: planMaxFeeSompi } : {})
      });
    }

    const amountSompi =
      typeof options.amount === "string"
        ? parseKasToSompi(options.amount)
        : typeof options.amount === "number"
          ? parseKasToSompi(options.amount.toString())
          : options.amount;

    if (amountSompi === 0n) {
      throw new Error(
        "Kaspa value-transfer outputs require amount > 0.\nFor metadata/notary/DID marker transactions use --amount 1."
      );
    }

    
    const allowMainnet =
      (this.sdk.config.config.networks?.mainnet as any)?.allowMainnet === true;

    // Address Preflight Validation
    validateAddressNetwork(fromAccount.address, activeNetwork, allowMainnet);
    validateAddressNetwork(toAccount.address, activeNetwork, allowMainnet);
    if (options.changeAddress) {
      validateAddressNetwork(options.changeAddress, activeNetwork, allowMainnet);
    }
    // AUD-28: validated above; forwarded to whichever planner runs (never dropped).
    const changeRequest = options.changeAddress ? { changeAddress: options.changeAddress } : {};

    // Wave 2(c) · AUD-19: the mempool observation the real-network snapshot was
    // filtered against, recorded in the plan (observer-local evidence).
    let pendingSpendEvidence: import("@hardkas/tx-builder").PendingSpendEvidence | undefined;

    // Create UtxoProvider
    const utxoProvider: UtxoProvider = {
      getUtxos: async (address: string) => {
        if (simulatedWorld) {
          const { loadOrCreateLocalnetState, getSpendableUtxos } =
            await import("@hardkas/localnet");
          const localState = await loadOrCreateLocalnetState({
            cwd: this.sdk.workspace.root
          });
          const unspent = getSpendableUtxos(localState, address);
          return unspent.map((u) => {
            const parts = u.id.split(":");
            const index = Number(parts[parts.length - 1]);
            const transactionId = parts.slice(0, -1).join(":");
            return {
              outpoint: { transactionId, index },
              address: u.address,
              amountSompi: BigInt(u.amountSompi),
              scriptPublicKey: "mock-script"
            };
          });
        } else {
          let observedAtDaaScore: bigint | undefined;
          try {
            const info = await this.sdk.rpc.getBlockDagInfo();
            observedAtDaaScore = info.virtualDaaScore !== undefined ? BigInt(info.virtualDaaScore) : undefined;
          } catch {
            observedAtDaaScore = undefined;
          }
          const res = await this.sdk.query.getSpendableUtxos({
            address,
            excludePending: true,
            ...(observedAtDaaScore !== undefined ? { observedAtDaaScore } : {})
          });
          pendingSpendEvidence = res.pendingSpendEvidence;
          const rpcUtxos = res.data;
          return rpcUtxos.map((u: any) => {
            const utxo: any = {
              outpoint: {
                transactionId: u.outpoint.transactionId,
                index: u.outpoint.index
              },
              address: u.address,
              amountSompi: BigInt(u.amountSompi),
              scriptPublicKey: u.scriptPublicKey || "",
              isCoinbase: u.isCoinbase
            };
            if (u.blockDaaScore !== undefined) {
              utxo.blockDaaScore = BigInt(u.blockDaaScore);
            }
            // COVENANT-UTXO-PAYMENT-FILTER-1: the covenant id goes with the UTXO, so the planner leaves a covenant's out
            const covenantId = covenantIdOf(u);
            if (covenantId !== undefined) {
              utxo.covenantId = covenantId;
            }
            return utxo;
          });
        }
      },
      getVirtualDaaScore: async () => {
        if (simulatedWorld) {
          return 1000000n; // Arbitrary high score for simulator
        } else {
          try {
            const info = await this.sdk.rpc.getBlockDagInfo();
            return info.virtualDaaScore !== undefined ? BigInt(info.virtualDaaScore) : 0n;
          } catch {
            return undefined as any;
          }
        }
      }
    };

    const networkConfig = this.sdk.config.config.networks?.[activeNetwork];
    const coinbaseMaturity = getCoinbaseMaturity(activeNetwork, networkConfig?.kind === "kaspa-node" || networkConfig?.kind === "kaspa-rpc" || networkConfig?.kind === "simulated" ? networkConfig.consensusParams : undefined);
    
    // Priority is a fee RATE; the fee itself is computed by the planner with the
    // SDK over the real transaction (amounts included, so storage mass counts).
    // A fixed fee estimated from the shape alone cannot know that.
    let feeRate = options.feeRate;
    if (feeRate === undefined) {
      ({ feeRate } = await this.sdk.fees.estimate({
        priority: "normal",
        inputs: 1,
        outputs: 2,
        network: activeNetwork as NetworkId
      }));
    }

    // M10-B-completion (A′): domain-explicit dispatch.
    //
    // Real Kaspa execution paths (mainnet, testnet-N, devnet, localnet or
    // simnet backed by a real node) go to `planTransactionUpstream`, which
    // delegates coin selection, mass and fee to the pinned kaspa-wasm `Generator`.
    // The simulated developer harness (kaspa:sim_* accounts, mock scripts)
    // goes to `planTransactionSynthetic`, an explicitly NON-AUTHORITATIVE
    // synthetic planner. There is NO automatic fallback from the upstream
    // path to the synthetic path: an upstream failure surfaces to the caller
    // rather than being silently downgraded to synthetic. This preserves the
    // real-network authority claim while keeping the `mode: simulated` DX.
    const isSimulatedForPlan = simulatedWorld;
    const planService = new TxPlanService(utxoProvider, { coinbaseMaturity });
    let result;
    if (isSimulatedForPlan) {
      result = await planService.planTransactionSynthetic({
        fromAddress: fromAccount.address,
        toAddress: toAccount.address,
        amountSompi,
        feeRate,
        networkId: activeNetwork,
        ...changeRequest
      });
    } else {
      result = await planService.planTransactionUpstream({
        fromAddress: fromAccount.address,
        toAddress: toAccount.address,
        amountSompi,
        feeRate,
        networkId: activeNetwork,
        ...changeRequest
      });
    }

    const builderPlan = result.plan;
    // TX-FEE-GUARD-1: the planned fee within the lower of the plan's limit and the workspace's network limit
    assertFeeWithinLimit(
      BigInt(builderPlan.estimatedFeeSompi),
      effectiveFeeLimit({ planMaxFeeSompi, config: this.sdk.config.config, network: activeNetwork }),
      "plan",
      activeNetwork
    );

    const isSimulated =
      activeNetwork === (this.sdk.network as string)
        ? this.sdk.execution.mode === "simulator"
        : activeNetwork === "simulated" || this.sdk.config.config.networks?.[activeNetwork]?.kind === "simulated";
    let resolvedAssumptionLevel = options.assumption;
    if (!resolvedAssumptionLevel) {
      if (isSimulated) {
        resolvedAssumptionLevel = "local-simulated";
      } else if (activeNetwork === "simnet") {
        resolvedAssumptionLevel = "local-rpc";
      } else {
        resolvedAssumptionLevel = activeNetwork;
      }
    }

    const basePlan = createTxPlanArtifact({
      networkId: activeNetwork as NetworkId,
      // the plan records the mode of the resolved execution target (WORKSPACE-AUTHORITY-2), never one re-inferred from
      // the network's kind
      mode: isSimulated ? "simulator" : activeNetwork === (this.sdk.network as string) ? this.sdk.execution.mode : (networkConfig?.kind === "kaspa-node" ? "localnet" : "rpc"),
      from: {
        input: fromAccount.name || fromAccount.address,
        address: fromAccount.address,
        accountName: fromAccount.name
      },
      to: {
        input: toAccount.name || toAccount.address,
        address: toAccount.address
      },
      amountSompi,
      plan: builderPlan,
      ...(planMaxFeeSompi !== undefined ? { maxFeeSompi: planMaxFeeSompi } : {}),
      ctx: {
        ...systemRuntimeContext,
        ...(options.workflowId ? { workflowId: options.workflowId } : {}),
        assumptionLevel: resolvedAssumptionLevel,
        utxoSelection: result.utxoSelection,
        // M10-B-completion (A′): record which planner produced this artifact,
        // so downstream verify/lineage tools can distinguish real-network
        // authority (KASPA_WASM_GENERATOR) from the simulated harness
        // (SYNTHETIC_SIMULATOR). Real networks must always show
        // KASPA_WASM_GENERATOR — the dispatch above enforces that.
        ...(result.plannerAuthority ? { plannerAuthority: result.plannerAuthority } : {}),
        ...(result.plannerAuthorityDetail ? { plannerAuthorityDetail: result.plannerAuthorityDetail } : {}),
        ...(pendingSpendEvidence ? { pendingSpendEvidence } : {})
      }
    }) as unknown as TxPlanArtifact;

    // Wave 1.2 · IC-5′.6: persisted references are authenticated artifactIds. The
    // input is resolved through the namespaced reader (a contained path or a 64-hex
    // artifactId; a label is NAMESPACE_REQUIRED) and verified; there is no raw
    // fallback: an unresolvable reference fails the plan.
    const resolveReference = async (input: string, kind: string): Promise<string> => {
      try {
        const artifact = await this.sdk.artifacts.read(input);
        return artifact.contentHash as string;
      } catch (e: any) {
        if (e?.code === "ARTIFACT_NOT_FOUND") {
          throw new HardkasError("REFERENCE_MISSING", `Referenced ${kind} ${input} not found in workspace`);
        }
        throw e;
      }
    };

    if (options.policy || (options as any).policies) {
      const inputPolicies: string[] =
        (options as any).policies || (options.policy ? [options.policy] : []);
      const resolvedRefs: string[] = [];
      for (const p of inputPolicies) {
        resolvedRefs.push(await resolveReference(p, "policy"));
      }
      if (resolvedRefs.length > 0) {
        (basePlan as any).policyRefs = resolvedRefs;
        (basePlan as any).policyRef = resolvedRefs[0]; // Legacy field, same artifactId
      }
    }

    if (options.networkProfile) {
      (basePlan as any).networkProfileRef = await resolveReference(options.networkProfile, "network profile");
    }

    if (options.assumption) {
      (basePlan as any).assumptionRef = await resolveReference(options.assumption, "assumption");
    }

    // Seal the identity now that references are injected: one pass, root form (D-Q1.d).
    const { finalizeTxPlanIdentity } = await import("@hardkas/artifacts");
    finalizeTxPlanIdentity(basePlan as any);
    // Not memoised: the plan is not on disk yet (IC-5′.8, the cache mirrors the store).

    // Verify policy evaluation at planning time if policies are provided
    if ((basePlan as any).policyRefs && (basePlan as any).policyRefs.length > 0) {
      await this.sdk.artifacts.verify(basePlan, {
        throwOnInvalid: true,
        strict: true,
        enforceMetadata: false
      });
    }

    return basePlan;
  }

  /**
   * Creates a transaction plan explicitly for consolidation.
   * This overrides normal selection logic and uses precisely the provided UTXOs.
   */
  async createConsolidationPlan(options: {
    account: HardkasAccount | string;
    selectedUtxos: any[];
    destination: string;
    network?: string;
    feeRate?: bigint;
    totalUtxosSeen?: number;
    /** TX-FEE-GUARD-1: see `plan({ maxFeeSompi })`. */
    maxFeeSompi?: bigint | number | string;
  }): Promise<TxPlanArtifact> {
    // TX-FEE-GUARD-1: as in plan()
    if (options.feeRate !== undefined) parseFeeRate(options.feeRate, "tx.createConsolidationPlan feeRate");
    const planMaxFeeSompi = options.maxFeeSompi === undefined ? undefined : parseMaxFeeSompi(options.maxFeeSompi, "tx.createConsolidationPlan maxFeeSompi");
    let resolvedAccount: HardkasAccount;
    if (typeof options.account === "string") {
      resolvedAccount = await this.sdk.accounts.resolve(options.account);
    } else {
      resolvedAccount = options.account;
    }

    if (!resolvedAccount?.address) {
      throw new Error(
        `Account '${resolvedAccount?.name || options.account}' has no address.`
      );
    }

    // WORKSPACE-AUTHORITY-2 (closeout): this instance's resolved execution target is the authority of a consolidation
    // too. A per-call `network` is validated by the shared resolver and must be THIS instance's world (an instance is
    // never re-pointed by one call); the account, the destination and the UTXOs are checked against that world before
    // any plan exists — the rules `tx.plan` applies (shared from @hardkas/accounts), never a cross-world artifact.
    const world = this.sdk.execution;
    if (options.network !== undefined) {
      const { resolveWorkspaceExecution } = await import("@hardkas/config");
      const requested = resolveWorkspaceExecution({ config: this.sdk.config.config, network: options.network }).networkId;
      if (requested !== (this.sdk.network as string)) {
        throw new HardkasError(
          "EXECUTION_NETWORK_MISMATCH",
          `This instance runs on '${this.sdk.network}' (${world.mode}); a consolidation on '${options.network}' needs an instance opened on it (Hardkas.open({ network: "${options.network}" }) or a target). Nothing was planned.`
        );
      }
    }
    assertAccountCompatible(resolvedAccount, world);
    const destinationAccount = await this.sdk.accounts.resolve(options.destination, world);
    assertAccountCompatible(destinationAccount, world);
    const selected = Array.isArray(options.selectedUtxos) ? options.selectedUtxos : [];
    const foreign = selected.filter((u: any) => u?.address !== resolvedAccount.address);
    if (foreign.length > 0) {
      throw new HardkasError(
        "UTXO_ACCOUNT_MISMATCH",
        `${foreign.length} of ${selected.length} selected UTXOs do not belong to '${resolvedAccount.name}' (${resolvedAccount.address}): a consolidation spends the account's own UTXOs only. Nothing was planned.`
      );
    }

    const activeNetwork = this.sdk.network as string;
    const isSimulated = world.mode === "simulator";

    const dummyProvider: UtxoProvider = {
      getUtxos: async () => []
    };
    const networkConfig = this.sdk.config.config.networks?.[activeNetwork];
    const coinbaseMaturity = getCoinbaseMaturity(activeNetwork, networkConfig?.kind === "kaspa-node" || networkConfig?.kind === "kaspa-rpc" || networkConfig?.kind === "simulated" ? networkConfig.consensusParams : undefined);
    
    const planService = new TxPlanService(dummyProvider, { coinbaseMaturity });
    const result = await planService.planConsolidation({
      fromAddress: resolvedAccount?.address as string,
      selectedUtxos: options.selectedUtxos,
      toAddress: options.destination,
      networkId: activeNetwork,
      simulated: isSimulated,
      ...(options.feeRate !== undefined ? { feeRate: options.feeRate } : {})
    });

    const builderPlan = result.plan;
    const firstOutput = builderPlan.outputs[0];
    if (!firstOutput) {
      throw new Error("Consolidation failed: transaction builder produced no outputs.");
    }
    const outputAmount = firstOutput.amountSompi;
    // TX-FEE-GUARD-1
    assertFeeWithinLimit(
      BigInt(builderPlan.estimatedFeeSompi),
      effectiveFeeLimit({ planMaxFeeSompi, config: this.sdk.config.config, network: activeNetwork }),
      "plan",
      activeNetwork
    );

    let resolvedAssumptionLevel = isSimulated ? "local-simulated" : "local-rpc";

    const basePlan = createTxPlanArtifact({
      networkId: activeNetwork as any,
      mode: world.mode,
      from: {
        input: resolvedAccount?.name || (resolvedAccount?.address as string),
        address: resolvedAccount?.address as string,
        accountName: resolvedAccount?.name
      },
      to: {
        input: options.destination,
        address: options.destination
      },
      amountSompi: outputAmount,
      plan: builderPlan,
      ...(planMaxFeeSompi !== undefined ? { maxFeeSompi: planMaxFeeSompi } : {}),
      ctx: {
        ...systemRuntimeContext,
        assumptionLevel: resolvedAssumptionLevel,
        utxoSelection: {
          strategy: result.utxoSelection.selectionStrategy,
          totalUtxosSeen: options.totalUtxosSeen ?? options.selectedUtxos.length,
          selectedUtxos: result.utxoSelection.selectedUtxos,
          purpose: result.utxoSelection.purpose
        }
      } as any
    }) as unknown as TxPlanArtifact;

    // createTxPlanArtifact already sealed the identity in root form (D-Q1.d); nothing
    // was added since, so no second pass is needed or allowed (IC-1′.4). Not memoised:
    // the plan is not on disk yet (IC-5′.8).
    return basePlan;
  }




  /**
   * Signs a transaction plan.
   */
  async sign(
    plan: TxPlanArtifact | SignedTxArtifact,
    options?: SignTxOptions
  ): Promise<SignedTxArtifact>;

  /**
   * @deprecated Pass options as the second argument instead.
   */
  async sign(
    plan: TxPlanArtifact | SignedTxArtifact,
    account: HardkasAccount | string | any,
    options?: LegacySignTxOptions
  ): Promise<SignedTxArtifact>;

  async sign(
    plan: TxPlanArtifact | SignedTxArtifact,
    accountOrOptions?: HardkasAccount | string | any | SignTxOptions,
    legacyOptions?: LegacySignTxOptions
  ): Promise<SignedTxArtifact> {
    if (!plan || typeof plan !== "object") {
      const e = new Error("TX_ARTIFACT_SCHEMA_INVALID: Input plan must be a valid artifact object.");
      (e as any).code = "TX_ARTIFACT_SCHEMA_INVALID";
      throw e;
    }

    // On-the-fly normalization for legacy artifacts
    if (!plan.schema) {
      if ((plan as any).metadata?.schema) {
        (plan as any).schema = (plan as any).metadata.schema;
      } else if ((plan as any).inputs && (plan as any).outputs) {
        (plan as any).schema = HardkasSchemas.TxPlan;
      }
    }

    if (!plan.schema) {
      const e = new Error("TX_ARTIFACT_SCHEMA_INVALID: Artifact is missing the required 'schema' or 'metadata.schema' property.");
      (e as any).code = "TX_ARTIFACT_SCHEMA_INVALID";
      throw e;
    }

    // SDK-MAINNET-BROADCAST-GUARD-1: no signature on mainnet — decided from every network identity involved (the
    // artifact's own and its execution's, and this instance's), before any signer is asked, external ones included,
    // and before anything is written. allowPublic does not lift it.
    assertMainnetTransactionsDisabled(
      "sign",
      // MAINNET-PERIMETER-1 (B2): also the network this instance's config entry DECLARES, whatever its name
      [(plan as any).networkId, (plan as any).execution?.network, this.sdk.network, declaredNetworkIdOf(this.sdk.config.config, this.sdk.network)],
      "tx.sign"
    );

    // TX-FEE-GUARD-1: before any signer is asked, a plan's fee is within the limit in force (the plan's own and the
    // workspace's for its network, the lower one), measured on what the plan really pays (inputs - outputs - change),
    // never only on the fee it declares: a plan built by another route cannot understate it.
    if ((plan as any).schema === HardkasSchemas.TxPlan || (plan as any).schema === HardkasSchemas.TxPlanV1) {
      const planNetwork = String((plan as any).networkId ?? this.sdk.network);
      const limit = effectiveFeeLimit({ planMaxFeeSompi: (plan as any).maxFeeSompi, config: this.sdk.config.config, network: planNetwork });
      if (limit) {
        const paid = planPaysFeeSompi(plan as any);
        const declared = /^\d+$/.test(String((plan as any).estimatedFeeSompi)) ? BigInt((plan as any).estimatedFeeSompi) : undefined;
        if (paid === undefined && declared === undefined) {
          throw new HardkasError(
            "FEE_LIMIT_UNVERIFIABLE",
            `Refusing to sign: a fee limit of ${limit.maxFeeSompi} sompi is in force and this plan's fee cannot be computed from its amounts. Nothing was signed.`
          );
        }
        assertFeeWithinLimit(paid !== undefined && declared !== undefined ? (paid > declared ? paid : declared) : (paid ?? declared)!, limit, "sign", planNetwork);
      }
    }

    // COVENANT-UTXO-PAYMENT-FILTER-1B (F1.0-bis): before any signer is asked (an external one too), any account is
    // resolved or key opened, and anything is written, a plan that spends a covenant's UTXO is refused: on what the plan
    // declares, then on what the node lists for each input.
    await this.refuseCovenantInputs(plan);

    if (
      (plan as any).schema === HardkasSchemas.TxPlanV1 ||
      (plan as any).schema === HardkasSchemas.SignedTxV1 ||
      (plan as any).txVersion === 1
    ) {
      // SURFACE-TRUTH-1B: decided by what would sign the plan, never by a provider name. The former check counted an unset
      // `wasm.provider` as "npm" and refused every provider but "local" with "Upgrade to WASM v2.x", while the default
      // (managed, the pinned kaspa-wasm) signs v1 and the capability probe said so.
      if ((plan as any).mode === "simulator") {
        // The simulator authorizes and applies payments without modelling the transaction version: it would drop the v1
        // fields (compute budget, covenant outputs, storage mass) silently.
        throw new HardkasError(
          "TX_V1_SIMULATION_UNSUPPORTED",
          "The simulator does not model transaction v1 (compute budget, covenant outputs, storage mass): it authorizes and applies version-0 payments only. Sign v1 plans for a node network.",
          { metadata: { planId: (plan as any).planId ?? null } }
        );
      }
      if (!this.sdk.signer) {
        // The runtime the signer loads (`signTxPlanArtifact`), with the check the signer itself applies. A runtime that
        // does not load is reported by the signer.
        const { getKaspaSigningBackendStatus } = await import("@hardkas/accounts");
        const runtime = await getKaspaSigningBackendStatus(this.sdk.config.config.wasm);
        if (runtime.available && !runtime.capabilities?.transactionV1Signing) {
          throw new HardkasError(
            "BLOCKED_BY_DEPENDENCY",
            `The loaded kaspa-wasm (${runtime.version}) does not sign transaction v1.`,
            { metadata: { runtimeVersion: runtime.version } }
          );
        }
      }
    }

    let resolvedAccount: HardkasAccount | undefined = undefined;
    let actualOptions: SignTxOptions = {};

    if (isSignTxOptions(accountOrOptions)) {
      actualOptions = accountOrOptions;
    } else {
      actualOptions = { ...legacyOptions } as SignTxOptions;
      if (accountOrOptions) {
        if (typeof accountOrOptions === "object" && typeof accountOrOptions.authorize === "function") {
          // Direct authorizer support
          const actualAuthorizers: Record<number, any> = {};
          for (let i = 0; i < (plan as any).inputs?.length || 0; i++) {
            actualAuthorizers[i] = accountOrOptions;
          }
          actualOptions.authorizers = actualAuthorizers;
        } else if (typeof accountOrOptions === "string") {
          actualOptions.account = await this.sdk.accounts.resolve(accountOrOptions, (plan as any).execution);
        } else {
          actualOptions.account = accountOrOptions;
        }
      }
    }

    if (
      (plan as any).schema === HardkasSchemas.SignedTx ||
      (plan as any).schema === HardkasSchemas.SignedTxV1
    ) {
      if (actualOptions.append === undefined && (plan as any).status === "partially_signed") {
        // Auto-detect append
        actualOptions = { ...actualOptions, append: true };
      }
    }

    if (
      !actualOptions.append &&
      ((plan as any).schema === HardkasSchemas.SignedTx ||
      (plan as any).signedTxId ||
      (plan as any).transactionId ||
      (plan as any).schema === HardkasSchemas.SignedTxV1)
    ) {
      const e = new Error(
        "ALREADY_SIGNED_ARTIFACT: Already signed artifact passed to tx.sign. Multi-sig append is not yet supported."
      );
      (e as any).code = "ALREADY_SIGNED_ARTIFACT";
      throw e;
    }

    if (
      (plan as any).schema !== HardkasSchemas.TxPlan &&
      (plan as any).schema !== HardkasSchemas.SignedTx &&
      (plan as any).schema !== HardkasSchemas.TxPlanV1 &&
      (plan as any).schema !== HardkasSchemas.SignedTxV1
    ) {
      const e = new Error(`TX_ARTIFACT_SCHEMA_INVALID: Unsupported artifact schema for signing: ${(plan as any).schema}`);
      (e as any).code = "TX_ARTIFACT_SCHEMA_INVALID";
      throw e;
    }

    // Option parsing moved above

    const planExecutionTarget = (plan as any).execution;
    if (actualOptions.account) {
      if (typeof actualOptions.account === "string") {
        resolvedAccount = await this.sdk.accounts.resolve(actualOptions.account, planExecutionTarget);
      } else {
        resolvedAccount = actualOptions.account;
      }
    } else if (!actualOptions.authorizers) {
      const fromName =
        (plan as any).from?.accountName ||
        (plan as any).from?.input ||
        (plan as any).from?.address;
      if (!fromName)
        throw new Error(
          "Plan does not specify an account name and no account was provided for signing."
        );
      resolvedAccount = await this.sdk.accounts.resolve(fromName, planExecutionTarget);
    }

    let actualAuthorizers = actualOptions.authorizers;

    const planId = (plan as any).planId || (plan as any).sourcePlanId || "unknown";
    await this.sdk.plugins.onBeforeTxSign({ planId, account: resolvedAccount?.name || "unknown" });

    if (typeof plan === "object" && plan !== null && (plan as any).contentHash) {
      await this.sdk.artifacts.verify(plan, {
        throwOnInvalid: true,
        strict: true,
        enforceMetadata: false,
        ...(actualOptions.plan ? { parent: actualOptions.plan } : {})
      });
    }

    if (this.sdk.signer && plan.schema === HardkasSchemas.TxPlan) {
      const produced = await this.sdk.signer.signTransaction(
        plan as TxPlanArtifact
      );

      await this.persistAuthorizedPlan(plan);
      // EVIDENCE-TRUST-1 (D2): what is returned is exactly what the store holds (the earlier copy of an identity signed before).
      const written = await this.sdk.artifacts.write(produced);
      const signedArtifact: typeof produced = written.artifact ?? produced;
      // EVENT-LEDGER-2 (EVENT-EMISSION-1): the store write above is announced by the artifact manager
      // (`artifact.written`, under the signed artifact's own workflowId). The raw `artifact.created` / `tx.signed`
      // objects once handed to normalizeAndEmit here duplicated it without a correlation and were discarded: gone.

      return signedArtifact;
    }

    let signedArtifact: any;

    if (plan.schema === HardkasSchemas.SignedTx) {
      // 1. Validate append intention
      if (plan.status === "signed") {
        throw new Error(
          "Cannot append signature to an already completed signed transaction."
        );
      }
      if (!actualOptions.append) {
        throw new Error(
          "Input file is a partially signed transaction. Use the --append flag to add your signature."
        );
      }

      const partialTx = plan as any;
      if (!partialTx.multisig) {
        throw new Error(
          "Input file is a signed transaction but does not contain multisig configuration."
        );
      }

      // Wave 1.4 · IC-6′.1/.5: the plan reference is the partial's AUTHENTICATED
      // `authorization.planArtifactId`, carried unchanged through every append. A
      // partial without one is legacy and unbound: it cannot be completed.
      const bound = partialTx.authorization;
      if (bound?.kind !== "synthetic" || typeof bound.planArtifactId !== "string" || !/^[0-9a-f]{64}$/.test(bound.planArtifactId)) {
        throw new HardkasError(
          "LEGACY_UNBOUND_SIGNED",
          "The partially signed artifact carries no authenticated plan reference: it is legacy and not bound to any plan. Re-authorize the plan with `hardkas tx sign` from the first signature."
        );
      }
      const boundPlanArtifactId: string = bound.planArtifactId;

      const signerAddress = resolvedAccount?.address;
      if (!signerAddress) {
        throw new Error(`Signer account '${resolvedAccount?.name}' has no address.`);
      }

      // Check authorization
      const required = partialTx.multisig.requiredSigners;
      if (required && required.length > 0 && !required.includes(signerAddress)) {
        throw new Error(
          `Signer '${signerAddress}' is not an authorized signer for this transaction.`
        );
      }

      // Check double signature
      const sigs = partialTx.multisig.signatures || [];
      if (sigs.some((s: any) => s.signer === signerAddress)) {
        throw new Error(
          `Account '${signerAddress}' has already signed this transaction.`
        );
      }

      // IC-6′.4: a synthetic entry is never presented as a signature.
      const signatureEntry = {
        signer: signerAddress,
        kind: "synthetic" as const
      };

      // Append and sort alphabetically by signer address to ensure deterministic hash
      const newSignatures = [...sigs, signatureEntry].sort((a, b) =>
        deterministicCompare(a.signer, b.signer)
      );

      // Append metadata (excl. from contentHash)
      const newMeta = [
        ...(partialTx.signatureMetadata || []),
        {
          signer: signerAddress,
          signedAt: new Date().toISOString()
        }
      ];

      const thresholdReached = newSignatures.length >= partialTx.multisig.threshold;
      const finalStatus = thresholdReached ? "signed" : "partially_signed";

      const draft: any = {
        ...partialTx,
        status: finalStatus,
        // IC-6′.3: the signer set lives in the authenticated body.
        authorization: {
          kind: "synthetic",
          planArtifactId: boundPlanArtifactId,
          signers: newSignatures.map((s) => s.signer)
        },
        multisig: {
          ...partialTx.multisig,
          signatures: newSignatures
        },
        signatureMetadata: newMeta,
        lineage: createLineageTransition(partialTx, HardkasSchemas.SignedTx)
      };

      if (thresholdReached) {
        // IC-6′.2: the plan's `from` must be among the authorizing identities.
        if (!newSignatures.some((s) => s.signer === partialTx.from?.address)) {
          throw new HardkasError(
            "SIGNER_MISMATCH",
            `The threshold is reached without the plan's from ${String(partialTx.from?.address)}: a plan is authorized only by the account that owns its from`
          );
        }
        draft.signedTransaction = {
          format: SYNTHETIC_AUTHORIZATION_FORMAT,
          payload: boundPlanArtifactId
        };
        draft.txId = syntheticTxIdFor(boundPlanArtifactId);
      } else {
        delete draft.signedTransaction;
        delete draft.txId;
      }

      const { CURRENT_HASH_VERSION } = await import("@hardkas/artifacts");
      const hash = calculateContentHash(draft, CURRENT_HASH_VERSION);
      draft.signedId = `signed-${hash.slice(0, 16)}`;
      draft.contentHash = hash;
      if (draft.lineage) draft.lineage.artifactId = hash;

      signedArtifact = draft;
    } else if (plan.schema === HardkasSchemas.TxPlan) {
      if (actualOptions.append) {
        throw new Error(
          "Do not use --append for the first signature of a transaction plan."
        );
      }

      const threshold = actualOptions.threshold || 1;

      if (threshold > 1) {
        // Multisig first signature
        const signerAddress = resolvedAccount?.address;
        if (!signerAddress) {
          throw new Error(`Signer account '${resolvedAccount?.name}' has no address.`);
        }

        const requiredSignersList = actualOptions.requiredSigners || [signerAddress];
        const requiredSigners = [];
        for (const r of requiredSignersList) {
          const acc = await this.sdk.accounts.resolve(r);
          requiredSigners.push(acc.address || r);
        }

        if (!requiredSigners.includes(signerAddress)) {
          throw new Error(
            `Signer '${signerAddress}' is not an authorized signer for this transaction.`
          );
        }
        // IC-6′.2: a plan can only be authorized by the account that owns its `from`,
        // so a signer set that can never include it is refused up front.
        if (!requiredSigners.includes(plan.from.address)) {
          throw new HardkasError(
            "SIGNER_MISMATCH",
            `The required signers ${JSON.stringify(requiredSigners)} do not include the plan's from ${plan.from.address}`
          );
        }
        // IC-6′.1 / IC-4′.4: bind to the plan's FULL identity (never a legacy plan).
        const planArtifactId = authorizablePlanIdentity(plan);

        // IC-6′.4: a synthetic entry is never presented as a signature.
        const signatureEntry = {
          signer: signerAddress,
          kind: "synthetic" as const
        };

        const signatures = [signatureEntry].sort((a, b) =>
          deterministicCompare(a.signer, b.signer)
        );
        const signatureMetadata = [
          {
            signer: signerAddress,
            signedAt: new Date().toISOString()
          }
        ];

        const thresholdReached = signatures.length >= threshold;
        const finalStatus = thresholdReached ? "signed" : "partially_signed";

        const { HARDKAS_VERSION, ARTIFACT_VERSION, CURRENT_HASH_VERSION } =
          await import("@hardkas/artifacts");
        const draft: any = {
          schema: HardkasSchemas.SignedTx,
          schemaVersion: HardkasSchemas.ArtifactV1,
          hardkasVersion: HARDKAS_VERSION,
          version: ARTIFACT_VERSION,
          hashVersion: CURRENT_HASH_VERSION,
          createdAt: new Date().toISOString(),
          status: finalStatus,
          sourcePlanId: plan.planId,
          networkId: plan.networkId,
          mode: plan.mode,
          execution: (plan as any).execution || { mode: plan.mode as any, domain: "kaspa-l1", network: plan.networkId },
          from: plan.from,
          to: plan.to,
          amountSompi: plan.amountSompi,
          unsignedPayloadHash: plan.contentHash,
          // IC-6′.1/.3: plan reference and signer set in the authenticated body.
          authorization: {
            kind: "synthetic",
            planArtifactId,
            signers: signatures.map((s) => s.signer)
          },
          multisig: {
            threshold,
            requiredSigners,
            signatures
          },
          signatureMetadata,
          lineage: createLineageTransition(plan, HardkasSchemas.SignedTx),
          ...(plan.workflowId ? { workflowId: plan.workflowId } : {})
        };

        if (thresholdReached) {
          draft.signedTransaction = {
            format: SYNTHETIC_AUTHORIZATION_FORMAT,
            payload: planArtifactId
          };
          draft.txId = syntheticTxIdFor(planArtifactId);
        }

        // One pass: lineage.artifactId is a self reference excluded by exact path.
        const hash = calculateContentHash(draft, CURRENT_HASH_VERSION);
        draft.signedId = `signed-${hash.slice(0, 16)}`;
        draft.contentHash = hash;
        if (draft.lineage) draft.lineage.artifactId = hash;

        signedArtifact = draft;
      } else {
        const { resolveExecutionTarget } = await import("@hardkas/config");
        const target = (plan as any).execution || resolveExecutionTarget({ config: this.sdk.config.config, network: plan.networkId as string }).target;

        // Standard single-signature plan signing (maintains 100% backward compatibility)
        signedArtifact = await signTxPlanArtifact({
          target,
          planArtifact: plan,
          account: resolvedAccount as HardkasAccount,
          ...(actualAuthorizers ? { authorizers: actualAuthorizers } : {}),
          config: this.sdk.config.config,
          allowMainnet: false,
          ...(actualOptions.keystorePassword !== undefined ? { keystorePassword: actualOptions.keystorePassword } : {})
        });
      }
    } else {
      throw new Error(`Unsupported artifact schema for signing: ${(plan as any).schema}`);
    }

    // Persist and emit events. E01: the authorized plan first, then the signed.
    await this.persistAuthorizedPlan(plan);
    // EVIDENCE-TRUST-1 (D2): what is returned is exactly what the store holds (the earlier copy of an identity signed before).
    const written = await this.sdk.artifacts.write(signedArtifact);
    if (written.artifact) signedArtifact = written.artifact;
    // EVENT-LEDGER-2 (EVENT-EMISSION-1): the store write above is announced by the artifact manager
    // (`artifact.written`, under the signed artifact's own workflowId). The raw `artifact.created` / `tx.signed`
    // objects once handed to normalizeAndEmit here duplicated it without a correlation and were discarded: gone.

    // Fire non-blocking after hook
    // Do not await, or await but let plugin manager catch failure
    await this.sdk.plugins.onTxSigned({ planId, account: resolvedAccount?.name || "unknown", signedArtifact });

    return signedArtifact;
  }

  /**
   * Simulates a transaction on the local state without broadcasting to a real Kaspa node.
   * Modifies the local deterministic state and outputs receipt/trace artifacts.
   */
  /**
   * Wave 1.2 · IC-5′.10 / N5: a previous submission of the SAME executed artifact
   * (signed or plan) is found by that artifact's identity — a receipt whose
   * authenticated `lineage.parentArtifactId` is the executed artifact's contentHash —
   * verified, in FULL authentication scope (its `status` is authenticated), never by
   * txId and never by a status a legacy hash version did not cover.
   */
  /**
   * First contact · E01: a signed artifact authorizes ONE plan by its artifactId
   * (IC-6′.1), and the executor resolves that plan only from the store (IC-6′.2).
   * `sign()` persists the signed artifact, so it persists its subject too: the plan
   * goes into the store under its own verified identity if it is not there yet.
   * A stored copy that does not verify under that identity is never overwritten —
   * the resolver's error propagates and nothing is signed (tamper evidence stays).
   */
  private async persistAuthorizedPlan(plan: any): Promise<void> {
    if (plan?.schema !== HardkasSchemas.TxPlan && plan?.schema !== HardkasSchemas.TxPlanV1) return;
    const planId = plan?.contentHash;
    if (typeof planId !== "string" || !/^[0-9a-f]{64}$/.test(planId)) return;
    const { resolveArtifactSync } = await import("@hardkas/artifacts");
    try {
      resolveArtifactSync(this.sdk.workspace.root, { artifact: planId });
      return; // already stored and verified under this identity
    } catch (e: any) {
      if (e?.code !== "ARTIFACT_NOT_FOUND") throw e;
    }
    await this.sdk.artifacts.write(plan);
  }

  /**
   * COVENANT-UTXO-PAYMENT-FILTER-1B (F1.0-bis): a payment plan never spends a covenant's UTXO, whatever its outputs
   * declare. What the plan says is checked first; it is not trusted on its own, since a plan written by hand, by another
   * tool or by an older HardKAS can leave a covenant's UTXO unmarked. So for a plan on a node network the node is asked
   * what each input is. An input the node does not list unspent, or a node that cannot be asked, leaves the input
   * unverified: nothing is signed (fail closed). The simulator has no covenants, and its plans are not signed with keys.
   */
  private async refuseCovenantInputs(plan: any): Promise<void> {
    if (plan?.schema !== HardkasSchemas.TxPlan && plan?.schema !== HardkasSchemas.TxPlanV1) return;
    const inputs: any[] = [...(Array.isArray(plan.inputs) ? plan.inputs : []), ...(Array.isArray(plan.selectedUtxos) ? plan.selectedUtxos : [])];
    const outpointOf = (i: any) => `${String(i?.outpoint?.transactionId)}:${String(i?.outpoint?.index)}`;
    const declared = inputs.filter((i) => covenantIdOf(i) !== undefined);
    if (declared.length > 0) {
      throw new HardkasError(
        "COVENANT_UTXO_NOT_PAYMENT_INPUT",
        `Refusing to sign: this plan spends ${declared.length} covenant UTXO(s) (${declared.map(outpointOf).join(", ")}). A payment never ` +
          `spends a covenant's UTXO, whatever its outputs declare. A covenant is spent only through its own commands ` +
          `(hardkas silver covenant). Nothing was signed.`
      );
    }
    if (plan.mode === "simulator") return;
    // Only the plan's own node can say what its inputs are: an instance of another network (or the simulator) is never
    // asked in its place.
    if (String(plan.networkId) !== String(this.sdk.network) || this.sdk.execution.mode === "simulator") {
      throw new HardkasError(
        "COVENANT_UTXO_UNVERIFIED",
        `Refusing to sign: this plan is for ${String(plan.networkId)}, but this instance runs ` +
          `${this.sdk.execution.mode === "simulator" ? "the simulator" : String(this.sdk.network)}, so HardKAS cannot ask the plan's node ` +
          `what its inputs are and cannot check that none is a covenant's UTXO. Open the SDK on ${String(plan.networkId)}. Nothing was signed.`
      );
    }

    const byAddress = new Map<string, any[]>();
    const unverified: string[] = [];
    for (const i of inputs) {
      const address = typeof i?.address === "string" && i.address ? i.address : plan.from?.address;
      if (typeof address !== "string" || !address || typeof i?.outpoint?.transactionId !== "string") {
        unverified.push(`${outpointOf(i)} (no address or outpoint to look up)`);
        continue;
      }
      byAddress.set(address, [...(byAddress.get(address) ?? []), i]);
    }
    const covenant: string[] = [];
    for (const [address, group] of byAddress) {
      let listed: any[];
      try {
        listed = await this.sdk.rpc.getUtxosByAddress(address);
      } catch (e: unknown) {
        throw new HardkasError(
          "COVENANT_UTXO_UNVERIFIED",
          `Refusing to sign: the node could not be asked what this plan's inputs at ${address} are ` +
            `(${redactUrlCredentialsInText(e instanceof Error ? e.message : String(e))}), so HardKAS cannot check that none is a ` +
            `covenant's UTXO. Nothing was signed.`
        );
      }
      const byOutpoint = new Map((listed ?? []).map((u: any) => [`${String(u?.outpoint?.transactionId).toLowerCase()}:${Number(u?.outpoint?.index)}`, u]));
      for (const i of group) {
        const found = byOutpoint.get(`${String(i.outpoint.transactionId).toLowerCase()}:${Number(i.outpoint.index)}`);
        const id = found === undefined ? undefined : covenantIdOf(found);
        if (found === undefined) unverified.push(outpointOf(i));
        else if (id !== undefined) covenant.push(`${outpointOf(i)} (covenant id ${id})`);
      }
    }
    if (covenant.length > 0) {
      throw new HardkasError(
        "COVENANT_UTXO_NOT_PAYMENT_INPUT",
        `Refusing to sign: the node lists ${covenant.length} of this plan's inputs as a covenant's UTXO, which the plan does not ` +
          `say: ${covenant.join(", ")}. A payment never spends a covenant's UTXO. A covenant is spent only through its own ` +
          `commands (hardkas silver covenant). Nothing was signed.`
      );
    }
    if (unverified.length > 0) {
      throw new HardkasError(
        "COVENANT_UTXO_UNVERIFIED",
        `Refusing to sign: the node does not list ${unverified.length} of this plan's inputs as unspent (${unverified.join(", ")}), ` +
          `so HardKAS cannot check that none is a covenant's UTXO. Plan again from the node's current UTXOs. Nothing was signed.`
      );
    }
  }

  /**
   * SIMULATOR-DURABLE-EXECUTION-1: what a recovery reads back (the executed artifact and its plan) is in the store, under
   * its verified identity, before the ledger moves. Each is looked up at its canonical store path; a copy there that
   * does not verify as that identity is never overwritten, and nothing is executed.
   */
  private async persistExecutionMaterial(executed: any, plan: any): Promise<void> {
    const { storeEntryFor, checkArtifactIdentity } = await import("@hardkas/artifacts");
    const nodeFs = await import("node:fs");
    const nodePath = await import("node:path");
    for (const artifact of executed === plan ? [plan] : [plan, executed]) {
      const at = nodePath.join(this.sdk.workspace.root, ".hardkas", "artifacts", storeEntryFor(artifact).rel);
      if (nodeFs.existsSync(at)) {
        const check = checkArtifactIdentity(JSON.parse(stripBom(nodeFs.readFileSync(at, "utf-8"))));
        if (check.ok && check.artifactId === artifactIdentity(artifact)) continue;
        throw new HardkasError(
          "EXECUTION_MATERIAL_INVALID",
          `${at} does not verify as ${artifactIdentity(artifact)}; nothing was executed`
        );
      }
      await this.sdk.artifacts.write(artifact);
    }
  }

  private async findExistingSubmission(
    executedArtifactId: string
  ): Promise<{ receipt: TxReceiptArtifact; receiptPath: string } | null> {
    if (typeof executedArtifactId !== "string" || !/^[0-9a-f]{64}$/.test(executedArtifactId)) return null;
    const { enumerateWorkspaceArtifactsSync, verifyArtifactIntegritySync, TX_NAMESPACE_SCHEMAS } =
      await import("@hardkas/artifacts");
    const matches: Array<{ receipt: any; receiptPath: string }> = [];
    for (const entry of enumerateWorkspaceArtifactsSync(this.sdk.workspace.root)) {
      const a: any = entry.artifact;
      if (!TX_NAMESPACE_SCHEMAS.has(typeof a?.schema === "string" ? a.schema : "")) continue;
      if (a?.lineage?.parentArtifactId !== executedArtifactId) continue;
      const r = verifyArtifactIntegritySync(structuredClone(a), { strict: false });
      if (!r.ok || r.authScope !== "FULL") continue; // never decide on an unauthenticated status
      if (a.schema === HardkasSchemas.TxSubmissionV1) {
        // R-iii: a submission's authenticated submit result, never a status.
        if (a.submitResult?.accepted !== true) continue;
      } else if (a.status !== "accepted" && a.status !== "confirmed") {
        continue;
      }
      matches.push({ receipt: a, receiptPath: entry.path });
    }
    if (matches.length === 0) return null;
    matches.sort((x, y) => (x.receiptPath < y.receiptPath ? -1 : x.receiptPath > y.receiptPath ? 1 : 0));
    return matches[0]!;
  }

  async simulate(
    target: string | Partial<TxPlanArtifact> | SignedTxArtifact,
    options: { persist?: boolean; plan?: TxPlanArtifact } = {}
  ): Promise<{ receipt: TxReceiptArtifact; receiptPath?: string; tracePath?: string }> {
    const explicitPlan = options.plan;
    const isSignedTarget =
      typeof target === "object" && target !== null && (target as any).schema === ARTIFACT_SCHEMAS.SIGNED_TX;
    if (isSignedTarget) {
      // Wave 1.4 · IC-6′.2/.5: only a coherent synthetic authorization is executable.
      // A legacy simulated-format artifact is unbound (re-authorize); an
      // incoherent authorization (plan reference ≠ lineage parent ≠ txId, wrong
      // format, wrong signer set) is refused before anything is resolved.
      const binding = checkSyntheticAuthorization(target);
      if (!binding.ok) throw new HardkasError(binding.code, binding.message);
    }
    if (explicitPlan && isSignedTarget) {
      // An explicit plan must BE the plan the authorization names (IC-6′.1 / IC-5′.6).
      const { checkArtifactIdentity } = await import("@hardkas/artifacts");
      const check = checkArtifactIdentity(explicitPlan);
      const boundId = (target as any).authorization?.planArtifactId ?? (target as any).lineage?.parentArtifactId;
      if (!check.ok || check.artifactId !== boundId) {
        throw new HardkasError(
          "PARENT_PLAN_MISMATCH",
          `The supplied plan ${check.ok ? check.artifactId : "(unverifiable)"} is not the plan the signed artifact authorizes ${String(boundId)}`
        );
      }
    }
    if (typeof target === "object" && target !== null && (target as any).contentHash) {
      try {
        // Strict: references and lineage. An explicit plan is honoured only if it IS
        // the target's authenticated parent (identity-checked in the verifier, IC-5′.6).
        await this.sdk.artifacts.verify(target, {
          throwOnInvalid: true,
          strict: true,
          enforceMetadata: false,
          ...(explicitPlan ? { parent: explicitPlan } : {})
        });
      } catch (e: unknown) {
        if (((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)).includes("PARENT_MISSING")) {
          throw new Error("parent_plan_unresolved: Missing context plan for simulation.");
        }
        throw e;
      }
    }
    const persist = options.persist ?? true;
    // SIMULATOR-EXECUTION-UNIT-1: a persisted execution reads the simulated state, checks idempotency and its inputs,
    // applies the transition and writes the state with its evidence as one unit under `simulator-state`.
    if (!persist) return this.simulateUnit(target, explicitPlan, persist);
    const { withSimulatorState } = await import("@hardkas/localnet");
    return withSimulatorState(this.sdk.workspace.root, () => this.simulateUnit(target, explicitPlan, persist));
  }

  /** The body of `simulate`, run inside its unit when it persists (SIMULATOR-EXECUTION-UNIT-1). */
  private async simulateUnit(
    target: string | Partial<TxPlanArtifact> | SignedTxArtifact,
    explicitPlan: TxPlanArtifact | undefined,
    persist: boolean
  ): Promise<{ receipt: TxReceiptArtifact; receiptPath?: string; tracePath?: string }> {
    if (typeof target === "object" && target !== null && typeof (target as any).contentHash === "string") {
      // Idempotency by the executed artifact's identity (IC-5′.10), never by txId.
      const existing = await this.findExistingSubmission((target as any).contentHash);
      if (existing) {
        return { receipt: existing.receipt, receiptPath: existing.receiptPath };
      }
    }
    const {
      loadOrCreateLocalnetState,
      applySimulatedExecution,
      buildSimulatedExecutionEvidence,
      commitSimulatedExecution,
      currentEvidenceFormat,
      getTracePath,
      PENDING_EXECUTION_SCHEMA
    } = await import("@hardkas/localnet");

    const state = await loadOrCreateLocalnetState({ cwd: this.sdk.workspace.root });

    // the trace's start (one of the execution's five clock reads, SIMULATOR-DURABLE-EXECUTION-1)
    const startTime = Date.now();

    let planArtifact: any;
    let sourcePlanId = "unknown";
    let txId: string;
    let targetObj: any = target;

    if (typeof target === "string") {
      try {
        targetObj = await this.sdk.artifacts.read(target, {
          expectedSchema: ARTIFACT_SCHEMAS.TX_PLAN
        });
      } catch (e) {
        throw new Error(
          `Artifact '${target}' not found. If you already have an in-memory artifact, pass the object directly to tx.simulate(artifact).`
        );
      }
    }

    if (targetObj.schema === ARTIFACT_SCHEMAS.SIGNED_TX) {
      sourcePlanId = targetObj.sourcePlanId || "unknown";
      // Wave 1.4 · IC-6′.2: the plan is resolved ONLY by the artifactId the
      // authorization names (authenticated), from the store by verified identity —
      // never by the sourcePlanId label, never by the signed's own txId.
      const structural = checkSyntheticAuthorization(targetObj);
      if (!structural.ok) throw new HardkasError(structural.code, structural.message);
      const boundPlanId = structural.planArtifactId;
      if (explicitPlan) {
        // Identity already checked against authorization.planArtifactId above.
        planArtifact = explicitPlan;
      } else {
        try {
          planArtifact = await this.sdk.artifacts.read({ artifact: boundPlanId }, {
            expectedSchema: ARTIFACT_SCHEMAS.TX_PLAN
          });
        } catch (e) {
          throw new Error(`parent_plan_unresolved: ${(e as Error)?.message ?? String(e)}`);
        }
      }
      // The binding decided against the resolved plan: FULL identity, signer is the
      // plan's from, same transfer. Refuse to execute if anything fails.
      const binding = checkSyntheticAuthorization(targetObj, planArtifact);
      if (!binding.ok) throw new HardkasError(binding.code, binding.message);
      txId = binding.txId;
    } else {
      planArtifact = targetObj;
      sourcePlanId = planArtifact.planId || planArtifact.id || "unknown";

      // If persist is true and it's a new in-memory plan (no ID), we write it
      if (persist && !planArtifact.planId) {
        // A1: a ledger failure here comes before the simulator runs anything
        await this.sdk.artifacts.write(planArtifact).catch((e: unknown) =>
          rethrowWithLedgerEffect(e, { operation: "simulated-execution", outcome: "not-performed" })
        );
        sourcePlanId = planArtifact.planId || "unknown";
      }
      // D-Q2.a / N4: the synthetic txId IS the executed plan's identity.
      const planIdentity =
        typeof planArtifact.contentHash === "string" && /^[0-9a-f]{64}$/.test(planArtifact.contentHash)
          ? planArtifact.contentHash
          : calculateContentHash(planArtifact, CURRENT_HASH_VERSION);
      txId = syntheticTxIdFor(planIdentity);
    }

    const normalizedPlan = normalizeSimulatedPlanInput(planArtifact, sourcePlanId);

    // DEF-1c (Wave 1 continuation): produce ONE canonical receipt identity.
    // The prior implementation built a second `receiptBase` wrapper here with
    // its own contentHash — that wrapper never landed on disk yet was returned
    // to callers and emitted in events, causing artifact.created(schema=B) to
    // report path(A), plugin `receiptArtifact` divergence from the persisted
    // receipt, and verify PARENT_MISSING (because A's parentArtifactId was a
    // state hash, not an artifact hash).
    //
    // Fix: thread schema-owned lifecycle metadata into `applySimulatedPlan` →
    // `createSimulatedTxReceipt` so the canonical receipt produced in one
    // construction contains both execution evidence AND lifecycle metadata,
    // hashed once, persisted once, returned once, emitted once.
    //
    // Determinism: `submittedAt`/`confirmedAt` derive from `systemRuntimeContext.clock`,
    // matching the ctx used by createSimulatedTxReceipt for `createdAt`, so the
    // canonical receipt remains deterministic under replay.
    // `tracePath` is pre-computed from `txId` via the deterministic
    // `getTracePath` helper — no dependency on the receipt's own persisted
    // filename, which is written after hashing.
    const nowIso = new Date(systemRuntimeContext.clock.now()).toISOString();
    // SIMULATOR-DURABLE-EXECUTION-1: the receipt's createdAt is read here rather than inside the receipt builder, so the
    // same value can be committed with the ledger transition and the receipt rebuilt byte for byte after an interruption
    const receiptCreatedAt = new Date(systemRuntimeContext.clock.now()).toISOString();

    // Parent artifact for the receipt lineage: the artifact that was actually
    // executed/submitted. If the caller passed a signed artifact, that is the
    // predecessor (and its signedId is captured via sourceSignedId per
    // TxReceiptSchema). Otherwise the plan is the predecessor.
    const isSignedInput =
      targetObj &&
      typeof targetObj === "object" &&
      (targetObj as any).schema === ARTIFACT_SCHEMAS.SIGNED_TX;
    const executed = isSignedInput ? targetObj : planArtifact;

    const simResult = applySimulatedExecution({
      state,
      plan: normalizedPlan,
      executed,
      txId,
      workspaceRoot: this.sdk.workspace.root,
      clock: { submittedAt: nowIso, receiptCreatedAt }
    });

    if (!simResult.ok) {
      throw new Error(`Strict validation failed: ${simResult.errors?.join(", ")}`);
    }

    // EVENT-LEDGER-2 (EVENT-EMISSION-1): the raw `workflow.submitted` to "simulated://local" and `tx.submitted`
    // objects once handed to normalizeAndEmit here (no correlation, an invented endpoint) were discarded: gone. The
    // simulator's evidence is the receipt the durable commit publishes, announced below (D4).

    const completedAt = Date.now();

    // The canonical receipt: single identity for the simulator lifecycle (no wrapping, no rehashing, no fork).
    const receipt = simResult.receipt as any;
    const tracePath = getTracePath(txId, this.sdk.workspace.root);

    let receiptPath: string | undefined;
    if (persist) {
      // SIMULATOR-DURABLE-EXECUTION-1: the executed artifact and its plan are in the store before the ledger moves (the
      // record names them); post-state + record are then committed in one ledger write, the evidence is published and
      // the record cleared. The store is held for the whole sequence: a store held elsewhere delays the execution
      // instead of leaving the state moved without its evidence.
      // A1: a ledger failure while the material is stored comes before the state moves: nothing was executed
      await this.persistExecutionMaterial(executed, planArtifact).catch((e: unknown) =>
        rethrowWithLedgerEffect(e, { operation: "simulated-execution", outcome: "not-performed", txId: receipt.txId })
      );
      const clock = {
        traceStartedAtMs: startTime,
        submittedAt: nowIso,
        receiptCreatedAt,
        traceCompletedAtMs: completedAt,
        snapshotCreatedAt: new Date(systemRuntimeContext.clock.now()).toISOString()
      };
      const evidence = buildSimulatedExecutionEvidence({ postState: simResult.state, receipt, workspaceRoot: this.sdk.workspace.root, clock });
      await commitSimulatedExecution(this.sdk.workspace.root, {
        postState: simResult.state,
        record: {
          schema: PENDING_EXECUTION_SCHEMA,
          txId: receipt.txId,
          executedArtifactId: artifactIdentity(executed),
          preStateHash: receipt.preStateHash,
          postStateHash: receipt.postStateHash,
          clock,
          workspaceRoot: this.sdk.workspace.root,
          format: currentEvidenceFormat(),
          expected: { receipt: receipt.contentHash, stateSnapshot: evidence.stateSnapshot.contentHash, trace: evidence.trace.contentHash }
        },
        evidence
      });
      receiptPath = evidence.receiptPath;
    }

    // EVENT-LEDGER-2 (D4): the receipt the durable commit published is announced through the one artifact boundary,
    // under its content hash and its own workflowId (the plan's). The trace and the state snapshot of the same
    // commit are not announced yet (ARTIFACT-ANNOUNCE-2).
    if (persist && receiptPath) {
      try {
        emitArtifactWritten({
          artifactId: typeof receipt.contentHash === "string" ? receipt.contentHash : "unknown",
          absolutePath: receiptPath,
          sourceSubsystem: "sdk:tx-simulate",
          workflowId: typeof receipt.workflowId === "string" ? receipt.workflowId : undefined,
          networkId: receipt.networkId
        });
        // TASK-EVIDENCE-UNBOUND-1: what this instance put in the store, for a recording open on it
        this.sdk.artifacts.noteStored(receipt.contentHash);
      } catch (e: unknown) {
        // A1: the commit above already moved the simulated state: the failure names that execution and its receipt
        rethrowWithLedgerEffect(e, {
          operation: "simulated-execution",
          outcome: "executed",
          txId: receipt.txId,
          artifactId: typeof receipt.contentHash === "string" ? receipt.contentHash : undefined,
          artifactPath: receiptPath
        });
      }
    }
    const result: {
      receipt: TxReceiptArtifact;
      receiptPath?: string;
      tracePath?: string;
    } = { receipt };
    if (receiptPath) result.receiptPath = receiptPath;
    if (tracePath) result.tracePath = tracePath;

    return result;
  }

  /**
   * Sends a signed transaction to the real RPC network.
   */
  async send(
    signedArtifact: SignedTxArtifact,
    urlOrOptions?: string | SendTxOptions
  ): Promise<{
    /**
     * The artifact this send produced: a simulated `hardkas.txReceipt` in the
     * simulator, or the immutable `hardkas.txSubmission.v1` for a real broadcast
     * (R-iii part 1). Read `submission` for the typed real-send record.
     */
    receipt: TxReceiptArtifact | TxSubmissionArtifact;
    submission?: TxSubmissionArtifact;
    receiptPath?: string;
    artifactId?: string;
    mode?: string;
    simulated?: boolean;
    submitted?: boolean;
    txId?: string;
    /**
     * TX-SEND-IDEMPOTENT-1: this workspace had already recorded a submission of the transaction and the node holds it:
     * nothing was broadcast, `submission` is the recorded one and `derived` the state one observation found.
     */
    alreadySubmitted?: boolean;
    derived?: DerivedTxStatus;
    /**
     * F1.6 · a v1 send (PAYMENT-PREFLIGHT-1: or a payment sent with `preflight`) the node rejected: the class of its
     * rejection (final: never retried, rebuilt or re-sent).
     */
    rejection?: NodeRejection;
  }> {
    const activeNetwork = this.sdk.network as string;
    const sendOptions: SendTxOptions = typeof urlOrOptions === "object" && urlOrOptions !== null ? urlOrOptions : {};
    // PAYMENT-PREFLIGHT-1: asked for or not, never guessed from another value
    if (sendOptions.preflight !== undefined && typeof sendOptions.preflight !== "boolean") {
      throw new HardkasError("SEND_OPTION_INVALID", `Refusing to broadcast: 'preflight' is true or false, not ${JSON.stringify(sendOptions.preflight)}. Nothing was sent or recorded.`);
    }
    // SDK-MAINNET-BROADCAST-GUARD-1: no broadcast on mainnet — decided from every network identity involved (the signed
    // artifact's own and its execution's, and this instance's) before any RPC request, receipt or submission event.
    // A transaction signed anywhere (outside HardKAS included) is refused the same way; allowPublic does not lift it.
    assertMainnetTransactionsDisabled(
      "broadcast",
      // MAINNET-PERIMETER-1 (B2): also the network this instance's config entry DECLARES, whatever its name
      [(signedArtifact as any)?.networkId, (signedArtifact as any)?.execution?.network, activeNetwork, declaredNetworkIdOf(this.sdk.config.config, activeNetwork)],
      "tx.send"
    );
    // the world this instance runs on decides (WORKSPACE-AUTHORITY-2)
    const isSimulated = this.sdk.execution.mode === "simulator";
    const explicitUrl = typeof urlOrOptions === "string" ? urlOrOptions : sendOptions.url;
    // ENDPOINT-AUTHORITY-1 (EA-I4): an explicit endpoint never turns a simulated run into an RPC one
    if (explicitUrl !== undefined && isSimulated) {
      throw new HardkasError(
        "SEND_ENDPOINT_ON_SIMULATOR",
        `Cannot send to ${redactUrlCredentials(explicitUrl)}: this instance runs the simulator (network ${activeNetwork}), ` +
          `which has no RPC endpoint. Open an instance on that endpoint's network to broadcast. Nothing was sent or recorded.`
      );
    }
    // PAYMENT-PREFLIGHT-1: the simulator has no node to check the inputs and signatures against
    if (sendOptions.preflight === true && isSimulated) {
      throw new HardkasError(
        "SEND_PREFLIGHT_ON_SIMULATOR",
        `Cannot run the send preflight: this instance runs the simulator (network ${activeNetwork}), which has no node to check the ` +
          `inputs and signatures against. Nothing was sent or recorded.`
      );
    }

    if (isSimulated) {
      // Wave 1.4 · IC-6′.5: in the simulator only a coherent synthetic authorization
      // is executable; a legacy simulated-format artifact is refused with the
      // code that says to re-authorize. Decided before anything else is consulted.
      const binding = checkSyntheticAuthorization(signedArtifact);
      if (!binding.ok) throw new HardkasError(binding.code, binding.message);
    }

    if (
      typeof signedArtifact === "object" &&
      signedArtifact !== null &&
      (signedArtifact as any).contentHash
    ) {
      try {
        await this.sdk.artifacts.verify(signedArtifact as any, {
          throwOnInvalid: true,
          strict: true,
          enforceMetadata: false
        });
      } catch (e: unknown) {
        if (((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)).includes("PARENT_MISSING")) {
          // F1.6 · a v1 transaction without its plan is never sent, and says so with its own code
          if (payloadVersionOf(signedArtifact.signedTransaction?.payload) === 1 || (signedArtifact as any).txVersion === 1) {
            throw new HardkasError(
              "V1_SEND_PLAN_UNRESOLVED",
              `Refusing to broadcast: a v1 transaction is sent only with the plan that authorized it, and its plan ` +
                `(${String((signedArtifact as any).lineage?.parentArtifactId ?? "no lineage parent")}) is not in this workspace with a verified identity. Nothing was sent or recorded.`
            );
          }
          throw new Error("parent_plan_unresolved: Missing context plan for simulation.");
        }
        throw e;
      }
    }

    // Perform pre-broadcast semantic verification (VULN-05)
    const verification = verifySignedTxSemantics(signedArtifact);
    if (!verification.ok) {
      throw new Error(
        `Pre-broadcast semantic verification failed: ${verification.issues.map((i) => i.message).join(", ")}`
      );
    }

    const signedTxId = signedArtifact.txId || signedArtifact.signedId || signedArtifact.contentHash || "unknown";
    try {
      await this.sdk.plugins.onBeforeTxSend({ signedTxId, from: signedArtifact.from?.accountName || signedArtifact.from?.address || "unknown" });
    } catch (e: unknown) {
      // A1: a ledger failure here (a plugin's blocking decision being recorded) comes before anything is sent or executed
      rethrowWithLedgerEffect(e, {
        operation: isSimulated ? "simulated-execution" : "broadcast",
        outcome: "not-performed",
        txId: typeof signedArtifact.txId === "string" ? signedArtifact.txId : undefined
      });
    }

    if (isSimulated) {
      const persistOpt = typeof urlOrOptions === "object" ? urlOrOptions.persist : true;
      const explicitPlan = typeof urlOrOptions === "object" ? urlOrOptions.plan : undefined;
      const simOpts = {
        ...(persistOpt !== undefined ? { persist: persistOpt } : {}),
        ...(explicitPlan ? { plan: explicitPlan } : {})
      };

      let simResult: any;
      try {
        simResult = await this.simulate(signedArtifact, simOpts);
      } catch (e: unknown) {
        if (((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)) && ((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)).includes("invalid simulated input")) {
          // P1. Robust Idempotence: The UTXOs are already spent. Wave 1.2 · IC-5′.10 / N5:
          // only a verified receipt whose authenticated parent IS this signed artifact
          // counts; a receipt merely carrying the expected txId never does.
          const existing = await this.findExistingSubmission(signedArtifact.contentHash as string);
          if (existing) {
            return {
              mode: "simulator",
              simulated: true,
              submitted: false,
              txId: (existing.receipt as any).txId,
              artifactId: (existing.receipt as any).contentHash,
              receipt: existing.receipt as any,
              receiptPath: existing.receiptPath
            };
          }
        }
        throw e; // Re-throw if it wasn't an idempotent double-spend
      }

      const result: any = {
        mode: "simulator",
        simulated: true,
        submitted: false,
        txId: simResult.receipt.txId,
        // IC-5′.11: artifactId is the canonical identity, never a label or the txId.
        artifactId: (simResult.receipt as any).contentHash,
        receipt: simResult.receipt
      };

      if (simResult.receiptPath !== undefined) {
        result.receiptPath = simResult.receiptPath;
      }

      return result;
    }

    const url = explicitUrl;

    // R-iii part 1 (IC-2′.2): a submission records what HardKAS did against ONE
    // identified signed artifact. Without a verifiable identity there is nothing
    // to record the broadcast against, so nothing is broadcast.
    const { checkArtifactIdentity } = await import("@hardkas/artifacts");
    const signedIdentity = checkArtifactIdentity(signedArtifact);
    if (!signedIdentity.ok) {
      throw new HardkasError(
        "SUBMISSION_UNIDENTIFIED_SIGNED",
        `Refusing to broadcast: the signed artifact has no verifiable identity to record the submission against (${signedIdentity.issues.map((i) => i.code).join(", ")})`
      );
    }
    const signedArtifactId = signedIdentity.artifactId;

    // ENDPOINT-AUTHORITY-1 (EA-I3): a transaction is sent only on the network it was signed for. This compares the
    // artifact with the instance; whether the node behind the client serves that network is a separate check.
    const signedNetwork = (signedArtifact as { networkId?: unknown }).networkId;
    if (typeof signedNetwork === "string" && signedNetwork !== activeNetwork) {
      throw new HardkasError(
        "SEND_NETWORK_MISMATCH",
        `Refusing to broadcast: the signed artifact is for network ${signedNetwork}, this instance runs on ${activeNetwork}. ` +
          `Nothing was sent or recorded.`
      );
    }
    // TESTNET-PORT-COLLISION-1: no endpoint chosen for this public network — refused before any request or record (a
    // submission that never left this machine is not a failed submission)
    refuseUnresolvedEndpoint(this.sdk);
    // EA-I1/EA-I2: the endpoint a submission records is the endpoint of the client that submits it
    const endpoint = endpointAuthority(this.sdk.rpc, url, "SEND");

    const broadcastable = getBroadcastableSignedTransaction(signedArtifact);

    // Wave 2(a): the observer's cursor — where the virtual was when HardKAS submitted.
    // A fact about the submit (authenticated), never a post-send state. TX-SEND-SUBMITPOINT-1: read here, BEFORE the
    // submit, from one view of the chain (captureSubmitPoint); when it cannot be read the submission records why, and
    // the observer falls back to the pruning point. Nothing else about the send depends on it.
    const pointCapture = await captureSubmitPoint(this.sdk.rpc);

    // Wave 2(d) · AUD-18: the fee is derived from what the signed transaction consumes
    // (the plan's authenticated inputs, matched by outpoint) minus what it produces
    // (the signed outputs). Without that evidence the submission says so; it never
    // copies an estimate and never writes "0".
    // Before pricing anything, the signed transaction must BE the transaction the plan
    // authorized (inputs 1:1, outputs in order with amount and destination). A payload
    // that parses and diverges is refused here — nothing is broadcast and no
    // submission is written (2(d) security review: SIGNED_PLAN_MISMATCH).
    let feeEvidence: Extract<ReturnType<typeof deriveSubmissionFee>, { status: "derived" | "insufficient-evidence" }>;
    // F1.6 · a v1 transaction (its payload's version, the artifact's or its plan's) is sent only with its verified plan
    let v1Plan: any;
    // PAYMENT-PREFLIGHT-1 · the verified plan a payment's preflight looks its inputs up with
    let paymentPlan: any;
    {
      let plan: any;
      const parentId = (signedArtifact as any).lineage?.parentArtifactId;
      if (typeof parentId === "string" && /^[0-9a-f]{64}$/.test(parentId)) {
        try {
          plan = await this.sdk.artifacts.read({ artifact: parentId }, { expectedSchema: ARTIFACT_SCHEMAS.TX_PLAN });
        } catch {
          plan = undefined;
        }
      }
      const payloadVersion = payloadVersionOf(broadcastable.rawTransaction);
      const isV1 = payloadVersion === 1 || (signedArtifact as any).txVersion === 1 || plan?.txVersion === 1;
      if (isV1) {
        if (!plan) {
          throw new HardkasError(
            "V1_SEND_PLAN_UNRESOLVED",
            `Refusing to broadcast: a v1 transaction is sent only with the plan that authorized it, resolved with a verified identity, and ` +
              `its plan (${typeof parentId === "string" && parentId ? parentId : "no lineage parent"}) could not be. Nothing was sent or recorded.`
          );
        }
        if (payloadVersion !== (plan.txVersion === 1 ? 1 : 0)) {
          throw new HardkasError(
            "SIGNED_PLAN_MISMATCH",
            `Refusing to broadcast: the signed transaction is version ${payloadVersion} and its plan ${String(plan.contentHash)} authorizes version ${plan.txVersion === 1 ? 1 : 0}. Nothing was sent or recorded.`
          );
        }
        // The v1 engine's checks apply to its plans, to any plan carrying a v1 engine field, and to any payload that binds
        // an output to a covenant (a payment plan never authorizes a binding). A v1 payment of the Generator planner keeps
        // the payment checks below.
        if (plan.plannerAuthority === "HARDKAS_V1_PLANNER" || hasV1EngineFields(plan) || payloadHasCovenantBindings(broadcastable.rawTransaction)) {
          try {
            assertV1PlanShape(plan);
          } catch (e: any) {
            throw new HardkasError(typeof e?.code === "string" ? e.code : "V1_PLAN_INVALID", `Refusing to broadcast: ${withoutCode(e)}. Nothing was sent or recorded.`);
          }
          v1Plan = plan;
        }
      }
      const derived = deriveSubmissionFee({ signedTransaction: signedArtifact.signedTransaction, plan });
      if (derived.status === "mismatch") {
        throw new HardkasError(
          "SIGNED_PLAN_MISMATCH",
          `Refusing to broadcast: the signed transaction is not the transaction plan ${String(plan?.contentHash)} authorized (${derived.reason})`
        );
      }
      feeEvidence = derived;
      // TX-FEE-GUARD-1: before the broadcast, the fee the SIGNED transaction pays (derived from its outputs and the
      // plan's authenticated inputs) is within the limit in force — the plan's own and the workspace's for the network.
      // With a limit in force and no derived fee, nothing is sent (the limit cannot be checked).
      const limit = effectiveFeeLimit({ planMaxFeeSompi: plan?.maxFeeSompi, config: this.sdk.config.config, network: activeNetwork });
      if (limit) {
        if (derived.status !== "derived") {
          throw new HardkasError(
            "FEE_LIMIT_UNVERIFIABLE",
            `Refusing to broadcast: a fee limit of ${limit.maxFeeSompi} sompi is in force and the fee of the signed transaction cannot be derived (${derived.reason}). Nothing was sent or recorded.`
          );
        }
        assertFeeWithinLimit(BigInt(derived.feeSompi), limit, "send", activeNetwork);
      }
      paymentPlan = plan;
    }
    // PAYMENT-PREFLIGHT-1 · asked for: a v1 engine transaction is checked by its own preflight (F1.6), and a payment's
    // inputs are looked up at the addresses its verified plan names (the strict verification above already refuses a
    // plan named but absent, or none named; this refusal stays behind it, fail closed)
    if (sendOptions.preflight === true) {
      if (v1Plan) {
        throw new HardkasError(
          "SEND_PREFLIGHT_NOT_APPLICABLE",
          `Refusing to broadcast: the payment preflight checks payments; this is a v1 engine transaction (plan ${String(v1Plan.contentHash)}), ` +
            `which is always sent through its own check (F1.6). Send it without 'preflight'. Nothing was sent or recorded.`
        );
      }
      if (!paymentPlan) {
        throw new HardkasError(
          "SEND_PREFLIGHT_PLAN_UNRESOLVED",
          `Refusing to broadcast: the send preflight looks each input up at the address the transaction's plan names, and its plan ` +
            `(${String((signedArtifact as any).lineage?.parentArtifactId ?? "no lineage parent")}) is not in this workspace with a verified identity. Nothing was sent or recorded.`
        );
      }
    }

    // EXPECTED-TXID-1: the transaction is sent under the signed artifact's TXID, checked here — before the broadcast
    // and before any record, after the plan check — against the id the official kaspa-wasm computes for the payload
    // being sent (ids exclude signature scripts). The client is handed it (`expectedTxId`) so it can name it whatever
    // the node answers.
    const expectedTxId = signedTxIdToSend(signedArtifact, broadcastable.rawTransaction);

    // F1.6 · the v1 fields the payment check does not see (version, budgets, bindings, storage mass, payload…), and the
    // plan's whole transaction against the signed one's id
    let v1: { plan: any; signatureScripts: string[] } | undefined;
    if (v1Plan) {
      const check = checkSignedV1AgainstPlan(broadcastable.rawTransaction, v1Plan, expectedTxId);
      if (!check.ok) {
        throw new HardkasError(
          check.code,
          `Refusing to broadcast: the signed transaction is not the v1 transaction plan ${String(v1Plan.contentHash)} authorized (${check.reason}). Nothing was sent or recorded.`
        );
      }
      v1 = { plan: v1Plan, signatureScripts: check.signatureScripts };
    }

    // TX-SEND-IDEMPOTENT-1 (IC-5′.5: one submission per txId): a transaction this workspace already recorded a submission
    // for is never broadcast again. Under the transaction's workspace lock (two sends of it, from two processes or one,
    // never both broadcast) the recorded submission is looked up first; only without one does the broadcast go ahead.
    // F1.6: so a v1 re-send of something already recorded gets its record or TX_ALREADY_SUBMITTED, never "input spent".
    const broadcast = { signedArtifact, url, activeNetwork, isSimulated, signedTxId, signedArtifactId, endpoint, broadcastable, pointCapture, feeEvidence, expectedTxId };
    return withLock(
      { rootDir: this.sdk.workspace.root, name: `tx-send-${expectedTxId}`, command: "tx send", wait: true, timeoutMs: TX_SEND_LOCK_WAIT_MS },
      async () =>
        (await this.alreadySubmittedReply(expectedTxId)) ??
        (v1
          ? this.sendV1Locked(broadcast, { ...v1, options: sendOptions })
          : sendOptions.preflight === true
            ? this.sendPaymentPreflighted(broadcast, paymentPlan)
            : this.broadcastOnce(broadcast))
    );
  }

  /**
   * PAYMENT-PREFLIGHT-1 · a payment send its caller asked to check, under its txid lock once nothing is recorded for that
   * txid: the read-only check of its inputs and signatures against the node (payment-preflight.ts), then the one
   * broadcast, whose record carries the check's DAA score and guarantee (`preflight`). A refusal sends and records nothing.
   */
  private async sendPaymentPreflighted(broadcast: Parameters<HardkasTx["broadcastOnce"]>[0], plan: any) {
    let preflight: Awaited<ReturnType<typeof preflightPaymentSend>>;
    try {
      preflight = await preflightPaymentSend({ plan, rawTransaction: broadcast.broadcastable.rawTransaction, txId: broadcast.expectedTxId, node: this.v1PreflightNode() });
    } catch (e: any) {
      throw new HardkasError(typeof e?.code === "string" ? e.code : "PAYMENT_PREFLIGHT_FAILED", `Refusing to broadcast: ${withoutCode(e)}. Nothing was sent or recorded.`, {
        cause: e,
        ...(e?.detail ? { metadata: e.detail } : {})
      });
    }
    return this.broadcastOnce({ ...broadcast, v1Record: { preflight: { ...preflight.evidence } } });
  }

  /**
   * F1.6 · a v1 send under its txid lock, once nothing is recorded for that txid. Under one more lock per covenant it
   * spends (from the check to the record; they order processes of this workspace only — across workspaces or machines
   * the consensus decides): no pending transition of those covenants (COVENANT_TRANSITION_PENDING, unless explicitly
   * replaced), the read-only check of the inputs and F1.4 again, then the one broadcast and its record, which names the
   * covenant outpoints it spends, the check's DAA score and guarantee, and any transition it replaced.
   */
  private async sendV1Locked(
    broadcast: Parameters<HardkasTx["broadcastOnce"]>[0],
    v1: { plan: any; signatureScripts: string[]; options: SendTxOptions }
  ) {
    const spends = v1CovenantSpendsOf(v1.plan);
    const replace = [...new Set(typeof v1.options.replacePendingTransition === "string" ? [v1.options.replacePendingTransition] : v1.options.replacePendingTransition ?? [])];
    const run = async () => {
      const replaces = await this.pendingCovenantTransitions(spends, broadcast.expectedTxId, replace);
      let preflight: Awaited<ReturnType<typeof preflightV1Send>>;
      try {
        preflight = await preflightV1Send({
          plan: v1.plan,
          signatureScripts: v1.signatureScripts,
          node: this.v1PreflightNode(),
          facts: v1.options.v1Facts ?? createWorkspaceV1Facts({ workspaceRoot: this.sdk.workspace.root })
        });
      } catch (e: any) {
        throw new HardkasError(typeof e?.code === "string" ? e.code : "V1_PREFLIGHT_FAILED", `Refusing to broadcast: ${withoutCode(e)}. Nothing was sent or recorded.`, {
          cause: e,
          ...(e?.detail ? { metadata: e.detail } : {})
        });
      }
      return this.broadcastOnce({
        ...broadcast,
        v1Record: { ...(spends.length > 0 ? { covenantSpends: spends } : {}), preflight: { ...preflight.evidence }, ...(replaces.length > 0 ? { replaces } : {}) }
      });
    };
    const covenants = [...new Set(spends.map((s) => s.covenantId))].sort();
    if (covenants.length === 0) return run();
    return withLocks(
      this.sdk.workspace.root,
      covenants.map((id) => `covenant-${id}`),
      run,
      { command: "tx send", wait: true, timeoutMs: TX_SEND_LOCK_WAIT_MS }
    );
  }

  /**
   * F1.6 · the transitions of these covenants this workspace sent that are still pending: a recorded v1 submission that
   * spent one of them, neither rejected by the node, nor accepted (observed), nor in conflict (its covenant outpoint
   * spent while the node holds no trace of it). Each pending one refuses the send (COVENANT_TRANSITION_PENDING) unless
   * the caller names it for replacement, which is allowed only for a transition spending one of its covenant outpoints
   * (so the consensus accepts at most one of the two). Returns the artifactIds replaced. Building a plan is never blocked.
   */
  private async pendingCovenantTransitions(
    spends: ReadonlyArray<{ outpoint: string; covenantId: string; address: string }>,
    txId: string,
    replace: readonly string[]
  ): Promise<string[]> {
    const { checkArtifactIdentity } = await import("@hardkas/artifacts");
    const ids = new Set(spends.map((s) => s.covenantId));
    const outpoints = new Set(spends.map((s) => s.outpoint));
    const pending: Array<{ artifactId: string; txId: string; spends: Array<{ outpoint: string; covenantId: string; address: string }>; state: string }> = [];
    if (ids.size > 0) {
      for (const entry of enumerateWorkspaceArtifactsSync(this.sdk.workspace.root)) {
        const a: any = entry.artifact;
        if (a?.schema !== HardkasSchemas.TxSubmissionV1 || !Array.isArray(a.covenantSpends) || a.txId === txId) continue;
        if (!a.covenantSpends.some((s: any) => ids.has(String(s?.covenantId)))) continue;
        // only verified evidence decides (a record that does not verify is not a submission)
        const identity = checkArtifactIdentity(a);
        if (!identity.ok || pending.some((p) => p.artifactId === identity.artifactId)) continue;
        if (submitOutcomeOf(a.submitResult) === "rejected") continue;
        let state = "unobservable";
        try {
          const { derived } = await this.observe(a.txId);
          state = derived.status;
        } catch {
          state = "unobservable";
        }
        if (state === "ACCEPTED" || state === "CONFIRMED" || state === "FINALIZED" || state === "REJECTED_BY_NODE") continue;
        if (state !== "MEMPOOL_ACCEPTED" && state !== "MEMPOOL_ORPHAN") {
          // the node holds no trace of it: in conflict (never acceptable) once another transaction spent its outpoint
          try {
            const listed = await this.v1PreflightNode().utxosByAddresses([...new Set<string>(a.covenantSpends.map((s: any) => String(s.address)))]);
            if (a.covenantSpends.some((s: any) => !listed.has(String(s.outpoint)))) continue;
          } catch {
            // cannot tell: it stays pending
          }
        }
        pending.push({ artifactId: identity.artifactId, txId: a.txId, spends: a.covenantSpends, state });
      }
    }
    for (const r of replace) {
      const target = pending.find((p) => p.artifactId === r);
      if (!target) {
        throw new HardkasError(
          "COVENANT_REPLACEMENT_INVALID",
          `Refusing to broadcast: ${r} is not a pending transition of the covenant(s) this transaction spends. Nothing was sent or recorded.`
        );
      }
      if (!target.spends.some((s) => outpoints.has(s.outpoint))) {
        throw new HardkasError(
          "COVENANT_REPLACEMENT_INVALID",
          `Refusing to broadcast: a replacement spends the covenant outpoint the transition it replaces spent (${target.spends.map((s) => s.outpoint).join(", ")}), ` +
            `so the consensus accepts at most one of them; this transaction does not. Nothing was sent or recorded.`
        );
      }
    }
    const blocking = pending.filter((p) => !replace.includes(p.artifactId));
    if (blocking.length > 0) {
      throw new HardkasError(
        "COVENANT_TRANSITION_PENDING",
        `Refusing to broadcast: this workspace sent another transition of the same covenant whose outcome is not final ` +
          blocking.map((p) => `(transaction ${p.txId}, submission ${p.artifactId}, state ${p.state})`).join(", ") +
          `. Wait until it is accepted, or until another transaction spends its covenant outpoint; or replace it explicitly ` +
          `(replacePendingTransition: the submission's artifactId). Nothing was sent or recorded.`,
        { metadata: { pending: blocking.map((p) => ({ txId: p.txId, artifactId: p.artifactId, state: p.state })) } }
      );
    }
    return pending.map((p) => p.artifactId).sort();
  }

  /** F1.6 · the node a v1 send (and, PAYMENT-PREFLIGHT-1, a checked payment send) checks against: this instance's client, read-only. */
  private v1PreflightNode(): V1PreflightNode {
    const rpc: any = this.sdk.rpc;
    return {
      networkId: declaredNetworkIdOf(this.sdk.config.config, this.sdk.network) ?? String(this.sdk.network),
      utxosByAddresses: async (addresses) => {
        const listed = new Map<string, any>();
        for (const address of addresses) {
          for (const u of ((await rpc.getUtxosByAddress(address)) ?? []) as any[]) {
            const n = v1NodeUtxoOf(u);
            if (n) listed.set(n.key, n.utxo);
          }
        }
        return listed;
      },
      pendingSpentOutpoints: async (addresses) => {
        const spent = new Set<string>();
        for (const address of addresses) for (const o of (await observePendingSpends(rpc, address)).outpoints) spent.add(o);
        return spent;
      },
      virtualDaaScore: async () => {
        const info = await rpc.getBlockDagInfo();
        return info?.virtualDaaScore !== undefined && info?.virtualDaaScore !== null ? BigInt(info.virtualDaaScore) : undefined;
      }
    };
  }

  /**
   * TX-SEND-IDEMPOTENT-1: the one broadcast of a transaction and its record, run by send() under the transaction's lock
   * once every check has passed and no submission of it is recorded.
   */
  private async broadcastOnce(args: {
    signedArtifact: SignedTxArtifact;
    url: string | undefined;
    activeNetwork: string;
    isSimulated: boolean;
    signedTxId: string;
    signedArtifactId: string;
    endpoint: string | undefined;
    broadcastable: ReturnType<typeof getBroadcastableSignedTransaction>;
    pointCapture: Awaited<ReturnType<typeof captureSubmitPoint>>;
    feeEvidence: Extract<ReturnType<typeof deriveSubmissionFee>, { status: "derived" | "insufficient-evidence" }>;
    expectedTxId: string;
    /**
     * F1.6 · what a v1 send adds to its record (TxSubmissionSchema: covenantSpends, preflight, replaces); PAYMENT-PREFLIGHT-1:
     * a payment sent with its preflight adds the check (`preflight`) only.
     */
    v1Record?: { covenantSpends?: unknown; preflight: unknown; replaces?: string[] };
  }) {
    const { signedArtifact, url, activeNetwork, isSimulated, signedTxId, signedArtifactId, endpoint, broadcastable, pointCapture, feeEvidence, expectedTxId, v1Record } =
      args;
    // Attempt broadcast
    const broadcastRecord = broadcastable.rawTransaction as unknown as Record<
      string,
      unknown
    >;
    const localTxId = (broadcastRecord.id as string) || "unknown";
    // EVENT-LEDGER-2 closeout (CL-2): the submission's EVENT is decided by its RESULT, recorded after the submit call
    // answered (below): `workflow.submitted` only for a submission the node accepted, `workflow.failed` for one that
    // failed or was refused. An intent to submit is not a submission (a catalog kind for the intent is a proposal).
    const submissionWorkflowId =
      typeof signedArtifact.workflowId === "string" && signedArtifact.workflowId ? signedArtifact.workflowId : STANDALONE_WORKFLOW_ID;

    // The submit call's result is recorded as returned, accepted or not. EVIDENCE-TRUST-1 (ET-C4): the result is
    // authenticated, so a credential the RPC layer put into its error text (it names the URL) is redacted BEFORE hashing.
    let submitResult: { accepted: boolean; transactionId?: string; error?: string };
    try {
      // MAINNET-PERIMETER-1 (B2): the node's identity, asked through whatever client this instance holds (its own, or
      // one a caller injected) right before the broadcast — two answers, one non-mainnet network, the one this
      // instance's config declares. An identity refusal is typed (NODE_NETWORK_* / MAINNET_BROADCAST_DISABLED) and the
      // catch below lets it through as such: nothing is sent or recorded. Any other failure of these reads (the
      // connection lost, a timeout) happened before the broadcast started, so it is MARKED as raised before the
      // transport (TX-SEND-BLOCKED-OUTCOME-1): SUBMIT_NOT_SENT below, never a submission with an unknown outcome.
      if (!isSimulated) {
        try {
          await assertBroadcastNodeIdentity(this.sdk.rpc as any, declaredNetworkIdOf(this.sdk.config.config, activeNetwork), endpoint ? redactUrlCredentials(endpoint) : "the configured node");
        } catch (e) {
          if (isNodeNetworkIdentityError(e)) throw e;
          throw markRequestNotSent(e);
        }
      }
      const answer: any = await this.sdk.rpc.submitTransaction(broadcastable.rawTransaction as any, { expectedTxId } as any);
      // EXPECTED-TXID-1: whatever client answered, an accepted request is one whose answer names the expected TXID. An
      // answer naming none or another transaction is an unknown outcome (the node may hold it), never accepted. Not a
      // consensus confirmation either way.
      const named = typeof answer?.transactionId === "string" ? answer.transactionId.toLowerCase() : undefined;
      submitResult =
        answer?.accepted === false
          ? { accepted: false, ...(named === expectedTxId ? { transactionId: expectedTxId } : {}) }
          : named === expectedTxId
            ? { accepted: true, transactionId: expectedTxId }
            : {
                accepted: false,
                error: new RpcSubmitOutcomeUnknownError({
                  txId: expectedTxId,
                  reason: named ? `the node answered transaction ${named}, not the one submitted` : "the node's answer names no transaction"
                }).message
              };
    } catch (e: unknown) {
      // NODE-NETWORK-IDENTITY-1: the node said it serves another network (or none) before anything was sent to it:
      // nothing was submitted, so there is no submission to record; the caller gets the typed refusal itself.
      if (isNodeNetworkIdentityError(e)) throw e;
      // TX-SEND-BLOCKED-OUTCOME-1: the request was refused before it reached the transport — it certainly never left this
      // process. That is not a submission with an unknown outcome: nothing is recorded as submitted, and the caller
      // gets the typed refusal. (A request that may have left — a timeout, a lost connection — stays recorded below.)
      if (isRpcRequestNotSentError(e)) {
        throw new HardkasError(
          "SUBMIT_NOT_SENT",
          `Transaction ${signedArtifact.txId ?? localTxId} was not sent: the request never left this process (${redactUrlCredentialsInText(
            e instanceof Error ? e.message : String(e)
          )}). No submission was recorded; nothing reached the node.`
        );
      }
      submitResult = { accepted: false, error: redactUrlCredentialsInText(e instanceof Error ? e.message : String(e)) };
    }
    // EVENT-LEDGER-2 final closeout: from here on the broadcast has happened, or its outcome is unknown — what the
    // recorded result establishes (accepted request, the node's rejection, or no answer), never a consensus state
    const submitOutcome = submitOutcomeOf(submitResult);

    // DEF-1b: `mode` describes the EXECUTION SEMANTICS of the lifecycle, fixed
    // at plan/sign time. It is NOT a property of the transport (URL scheme).
    // Inherit `mode` from the signed parent (and its `execution.mode` if
    // declared); fall back to the URL-derived heuristic only when the parent
    // lacks an explicit mode (legacy pre-M10 signed artifacts).
    const inheritedMode: any =
      (signedArtifact as any).mode ||
      (signedArtifact as any).execution?.mode ||
      (url !== undefined ? "rpc" : "localnet");
    const nowIso = new Date().toISOString();
    // Authenticated: the signed reference, the txId, the submit result (IC-2′.2).
    // Unauthenticated: submittedAt and the locator `rpcUrl` (IC-1′.1b), recorded
    // without its credentials (EVIDENCE-TRUST-1 D5: no userinfo, secret-named query
    // values replaced by a marker, path and public query kept). The normalised
    // `endpoint` is ARCHITECTURE_BLOCKED (its normalisation is not ratified), so no
    // `endpoint` field is written and the endpoint provenance of a submission is NOT
    // authenticated yet. No post-send state lives here.
    const submissionBase: any = {
      schema: HardkasSchemas.TxSubmissionV1,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      networkId: this.sdk.network,
      mode: inheritedMode,
      createdAt: nowIso,
      ...(signedArtifact.execution ? { execution: signedArtifact.execution } : {}),
      signedArtifactId,
      // TX-SEND-SUBMITPOINT-1: when the node returned no id (no answer, connection lost, rejection), the submission
      // still names the transaction it sent — the signed artifact's own txId (authenticated by its content hash) — so
      // its submitPoint stays reachable by `tx wait <txId>`. It identifies what was sent; submitResult says what
      // happened, unchanged.
      txId:
        submitResult.transactionId ||
        (typeof signedArtifact.txId === "string" && /^[0-9a-f]{64}$/.test(signedArtifact.txId) ? signedArtifact.txId : localTxId),
      submitResult,
      ...("submitPoint" in pointCapture ? { submitPoint: pointCapture.submitPoint } : { submitPointUnavailable: pointCapture.submitPointUnavailable }),
      fee: feeEvidence,
      submittedAt: nowIso,
      // EA-I1: the submitting client's endpoint (absent when the client does not say; never a caller's label)
      ...(endpoint ? { rpcUrl: redactUrlCredentials(endpoint) } : {}),
      ...(signedArtifact.workflowId ? { workflowId: signedArtifact.workflowId } : {}),
      ...(signedArtifact.assumptionLevel
        ? { assumptionLevel: signedArtifact.assumptionLevel }
        : {}),
      ...(signedArtifact.policyRefs ? { policyRefs: signedArtifact.policyRefs } : {}),
      ...(signedArtifact.networkProfileRef
        ? { networkProfileRef: signedArtifact.networkProfileRef }
        : {}),
      ...(signedArtifact.assumptionRef
        ? { assumptionRef: signedArtifact.assumptionRef }
        : {}),
      ...(v1Record ?? {}),
      lineage: createLineageTransition(signedArtifact, HardkasSchemas.TxSubmissionV1)
    };
    // One pass: lineage.artifactId is a self reference excluded by exact path.
    submissionBase.contentHash = calculateContentHash(submissionBase, CURRENT_HASH_VERSION);
    submissionBase.lineage.artifactId = submissionBase.contentHash;
    const produced: TxSubmissionArtifact = Object.freeze(submissionBase);
    // the transaction that was sent: the node's txId, else the signed artifact's (a failed call records "unknown")
    const sentTxId = [produced.txId, signedArtifact.txId].find((t) => typeof t === "string" && /^[0-9a-f]{64}$/.test(t)) as
      | string
      | undefined;

    let receiptPath: string | undefined;
    let submission: TxSubmissionArtifact = produced;
    try {
      // EVIDENCE-TRUST-1 (D2): what is returned is exactly what the store holds (the earlier copy of this identity, if any).
      const written = await this.sdk.artifacts.write(produced);
      receiptPath = written.absolutePath;
      if (written.artifact) submission = Object.freeze(written.artifact);

      // EVENT-LEDGER-2 closeout (CL-2; final closeout, decision 2): the submission's RESULT, once the call returned or
      // failed, under the signed artifact's own workflowId (never a derived one), naming the submission artifact that
      // records it: `workflow.submitted` for a submission request the node accepted, `workflow.failed` for the node's
      // rejection and, for a call that failed without an answer, `rpc.error` — the outcome is unknown, so neither a
      // submission nor a rejection is declared. Existing kinds only; no consensus state.
      const resultEvent = {
        domain: "workflow" as const,
        workflowId: asWorkflowId(submissionWorkflowId),
        correlationId: asCorrelationId(submissionWorkflowId),
        networkId: asNetworkId(this.sdk.network),
        sequenceNumber: asEventSequence(1),
        globalOffset: 0,
        sourceSubsystem: "sdk:tx-send",
        txId: asTxId(submission.txId),
        artifactId: asArtifactId(submission.contentHash as string)
      };
      const rpcUrl = endpoint ? redactUrlCredentials(endpoint) : "";
      coreEvents.emit(
        submitOutcome === "accepted"
          ? createEventEnvelope({ ...resultEvent, kind: "workflow.submitted", payload: { txId: asTxId(submission.txId), rpcUrl } })
          : submitOutcome === "rejected"
            ? createEventEnvelope({
                ...resultEvent,
                kind: "workflow.failed",
                payload: {
                  workflowId: asWorkflowId(submissionWorkflowId),
                  error: `the node rejected the submission: ${submitResult.error ?? "it answered accepted: false"}`
                }
              })
            : createEventEnvelope({
                ...resultEvent,
                domain: "rpc",
                kind: "rpc.error",
                payload: {
                  endpoint: asRpcEndpointId(rpcUrl || "unknown"),
                  error:
                    `submitTransaction failed without an answer from the node (${submitResult.error ?? "no answer"}): the outcome ` +
                    `of the submission is unknown, and the node may have received transaction ${sentTxId ?? submission.txId}`,
                  retriable: false
                }
              })
      );

      // Reuse the signedTxId from the start of the method
      await this.sdk.plugins.onTxSent({ signedTxId, receiptArtifact: submission });
    } catch (e: unknown) {
      // A1: a ledger failure after the broadcast names what was sent, never reads as "not sent"
      rethrowWithLedgerEffect(e, {
        operation: "broadcast",
        outcome: submitOutcome,
        txId: sentTxId,
        artifactId: produced.contentHash as string,
        artifactPath: receiptPath
      });
    }

    // F1.6 · the class of a v1 rejection, read from the recorded result; PAYMENT-PREFLIGHT-1: of a checked payment's too (a
    // payment sent without the check returns what it always did)
    const rejection = v1Record ? nodeRejectionOf(submitResult) : undefined;
    return {
      receipt: submission,
      submission,
      ...(receiptPath ? { receiptPath } : {}),
      artifactId: submission.contentHash as string,
      mode: "real",
      submitted: submitResult.accepted,
      txId: submission.txId,
      ...(rejection ? { rejection } : {})
    };
  }

  /**
   * TX-SEND-IDEMPOTENT-1 (IC-5′.5: one submission per txId), called by send() under the transaction's lock before any
   * broadcast. Without a recorded submission of `txId`: undefined, and the broadcast goes ahead. With one, the transaction
   * is not broadcast again — a second broadcast adds no fact the recorded one lacks, and a second record for the txId
   * would make every lookup of it ambiguous (RECEIPT_AMBIGUOUS_CONFLICT). ONE observation (a fact, the look `tx wait`
   * takes) decides the answer: the node holds the transaction (mempool or chain) → the recorded submission with the
   * derived state, nothing sent; it does not, or it cannot be observed → TX_ALREADY_SUBMITTED, nothing sent.
   */
  private async alreadySubmittedReply(txId: string) {
    const recorded: any = await this.findSubmissionForTxId(txId);
    if (!recorded) return undefined;
    const recordedOutcome = recorded.schema === HardkasSchemas.TxSubmissionV1 ? submitOutcomeOf(recorded.submitResult) : "unknown";
    let derived: DerivedTxStatus | undefined;
    let unobservable: string | undefined;
    try {
      derived = (await this.observe(txId)).derived;
    } catch (e: unknown) {
      unobservable = redactUrlCredentialsInText(e instanceof Error ? e.message : String(e));
    }
    if (derived && NODE_HOLDS_TX.has(derived.status)) {
      return {
        receipt: recorded as TxSubmissionArtifact,
        submission: recorded as TxSubmissionArtifact,
        artifactId: recorded.contentHash as string,
        mode: "real",
        submitted: false,
        alreadySubmitted: true,
        derived,
        txId
      };
    }
    throw new HardkasError(
      "TX_ALREADY_SUBMITTED",
      `Transaction ${txId} was not sent again: this workspace already recorded a submission of it (${String(recorded.contentHash)}, outcome ${recordedOutcome}), ` +
        (derived
          ? `and the node does not hold it now (derived state ${derived.status}: ${derived.reasons.join(" · ")}). `
          : `and whether the node holds it could not be observed (${unobservable}). `) +
        `Broadcasting it again would record a second submission for the same txId, which the evidence model does not allow ` +
        `(one submission per txId). Nothing was sent. Observe it with 'hardkas tx status ${txId}'.`
    );
  }

  /**
   * Explicitly appends a signature to a partially signed transaction.
   */
  async appendSignature(
    plan: SignedTxArtifact,
    account?: HardkasAccount | string
  ): Promise<SignedTxArtifact> {
    return this.sign(plan, account, { append: true });
  }

  /**
   * Fetches the current status of a transaction by ID.
   */
  /**
   * Wave 2(a) · Q4: the DERIVED state of `txId` from the evidence in this workspace
   * (the submission or simulator receipt plus every verified observation), under
   * `policy` (HardKAS product default unless given). No RPC call is made here; use
   * `observe()` to add evidence.
   */
  async status(txId: string, policy?: TxStatusPolicy): Promise<DerivedTxStatus> {
    const { ProjectArtifactStore } = await import("@hardkas/artifacts");
    const store = new ProjectArtifactStore(this.sdk.workspace.root);
    const submission = await this.findSubmissionForTxId(txId);
    const { observations } = store.listObservationsByTxId(txId);
    return deriveTxStatus({
      txId,
      ...(submission ? { submission } : {}),
      observations,
      ...(policy ? { policy } : {})
    });
  }
}

