import { HardkasSchemas } from "./registry.js";
import {
  TxId,
  KaspaAddress,
  ArtifactId,
  LineageId,
  NetworkId,
  RpcEndpointId,
  DaaScore,
  EventId,
  WorkflowId,
  CorrelationId,
  EventSequence
} from "./domain-types.js";
import { asArtifactId, asCorrelationId, asEventSequence, asNetworkId, asWorkflowId } from "./domain-types.js";
import { AppendCoordinator } from "./append-coordinator.js";
import { HardkasError } from "./errors.js";
import path from "node:path";

/**
 * HardKAS Core Event Domains.
 */
export type EventDomain =
  | "workflow"
  | "integrity"
  | "rpc"
  | "dag"
  | "replay"
  | "localnet"
  | "l2";

/**
 * HardKAS Core Event Kinds.
 */
export type EventKind =
  | "workflow.plan.created"
  | "workflow.signed"
  | "workflow.submitted"
  | "workflow.receipt"
  | "workflow.started"
  | "workflow.completed"
  | "workflow.failed"
  | "integrity.hash_mismatch"
  | "integrity.schema_violation"
  | "integrity.lineage_break"
  | "integrity.violation"
  | "dag.conflict"
  | "dag.displacement"
  | "dag.sink_moved"
  | "rpc.health"
  | "rpc.error"
  | "rpc.stale"
  | "replay.divergence"
  | "replay.verified"
  | "localnet.started"
  | "localnet.stopped"
  | "l2.deposit.planned"
  | "l2.withdrawal.planned"
  | "artifact.written"
  | "artifact.indexed"
  | "artifact.corrupted"
  | "sqlite.commit"
  | "replay.invalidated"
  | "replay.completed"
  | "replay.excluded"
  | "sse.emitted"
  | "dashboard.cache_invalidated"
  | "dashboard.refetch_started"
  | "dashboard.refetch_completed"
  | "query_store.sync_started"
  | "query_store.sync_completed"
  | "lineage.verification_failed";

/**
 * Payload mapping for each event kind.
 */
export interface EventPayloadByKind {
  "workflow.plan.created": {
    planId: ArtifactId;
    network: NetworkId;
    amountSompi: bigint;
  };
  "workflow.signed": { signedId: ArtifactId; planId: ArtifactId; txId?: TxId };
  "workflow.submitted": { txId: TxId; rpcUrl: string };
  "workflow.receipt": {
    txId: TxId;
    status: "accepted" | "finalized" | "failed";
    daaScore?: DaaScore;
  };
  "workflow.started": { workflowId: WorkflowId; network: NetworkId };
  "workflow.completed": { workflowId: WorkflowId };
  "workflow.failed": { workflowId: WorkflowId; error: string };

  "integrity.hash_mismatch": { artifactId: ArtifactId; expected: string; actual: string };
  "integrity.schema_violation": { artifactId: ArtifactId; details: string };
  "integrity.lineage_break": { lineageId: LineageId; artifactId: ArtifactId };
  "integrity.violation": {
    violationCode: string;
    severity: string;
    message: string;
    metadata?: Record<string, unknown> | undefined;
    sourceEventId?: string | undefined;
  };

  "dag.conflict": { outpoint: string; winner: TxId; losers: TxId[] };
  "dag.displacement": { txId: TxId; displacedBy: TxId };
  "dag.sink_moved": { oldSink: string; newSink: string; daaScore: DaaScore };

  "rpc.health": { endpoint: RpcEndpointId; state: string; latencyMs: number };
  "rpc.error": { endpoint: RpcEndpointId; error: string; retriable: boolean };
  "rpc.stale": {
    endpoint: RpcEndpointId;
    lastDaaScore: DaaScore;
    currentDaaScore: DaaScore;
  };

  "replay.divergence": { txId: TxId; field: string; expected: string; actual: string };
  "replay.verified": { txId: TxId; lineageId: LineageId };

  "localnet.started": { mode: string; networkId: NetworkId };
  "localnet.stopped": { reason: string };

  "l2.deposit.planned": { asset: string; amount: bigint; to: string };
  "l2.withdrawal.planned": { asset: string; amount: bigint; from: string };

  "artifact.written": { artifactId: ArtifactId; path: string };
  "artifact.indexed": { artifactId: ArtifactId; schema: string };
  "artifact.corrupted": { artifactId: ArtifactId; path: string; issue: string };
  "sqlite.commit": { transactionId: string; rowCount: number };

  "replay.invalidated": { artifactId: ArtifactId; reason: string };
  "replay.completed": { targetArtifactId: ArtifactId; success: boolean };
  "replay.excluded": { artifactId: ArtifactId; reason: string };

  "sse.emitted": { eventId: EventId; channel: string };

  "dashboard.cache_invalidated": { key: string };
  "dashboard.refetch_started": { key: string };
  "dashboard.refetch_completed": { key: string; success: boolean };

  "query_store.sync_started": { syncId: string };
  "query_store.sync_completed": { syncId: string; stats: Record<string, number> };
  "lineage.verification_failed": { artifactId: ArtifactId; missingParentId: ArtifactId };
}

/**
 * Formal Event Envelope (v1).
 *
 * Standardizes how events are captured and tracked across the system.
 */
export interface EventEnvelope<K extends EventKind = EventKind> {
  schema: typeof HardkasSchemas.Event;
  version: "1.0.0";

  eventId: EventId;
  domain: EventDomain;
  kind: K;

  timestamp: string; // Deprecated conceptually, use emittedAt
  emittedAt: string;
  sequenceNumber: EventSequence;
  globalOffset?: number;
  sourceSubsystem: string;

  workflowId: WorkflowId;
  correlationId: CorrelationId;
  causationId?: EventId;

  artifactId?: ArtifactId;
  txId?: TxId;
  networkId: NetworkId;

  payload: EventPayloadByKind[K];
}

/**
 * Compatibility type for listeners.
 */
export type CoreEvent = EventEnvelope;

/**
 * Legacy compatibility type for stamped events.
 * TODO: Deprecate once all consumers migrate to EventEnvelope.
 */
export type StampedEvent = EventEnvelope;

export type CoreEventListener = (event: EventEnvelope) => void;

/** EVENT-LEDGER-2 · a persistence sink: where an emitted envelope is made durable (the workspace event ledger). */
export type EventPersistenceSink = (event: EventEnvelope) => void;

/**
 * Lightweight in-memory Event Bus.
 *
 * EVENT-LEDGER-2 (EL2-I0): an emitted envelope is first handed to every persistence sink (the ledger attached with
 * attachLedgerAppender), then to the listeners. A listener's failure stays its own (fire-and-forget, as always); a
 * sink's failure is the emitter's: `emit` throws it (EVENT_LEDGER_APPEND_FAILED), so no caller can report a clean
 * success after a formal event that had to persist was lost. `emit` stays synchronous.
 */
class CoreEventBus {
  private listeners: CoreEventListener[] = [];
  private sinks: EventPersistenceSink[] = [];

  on(listener: CoreEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Registers a persistence sink and returns its detach. Attached by attachLedgerAppender, never by an observer. */
  persistWith(sink: EventPersistenceSink): () => void {
    this.sinks.push(sink);
    return () => {
      this.sinks = this.sinks.filter((s) => s !== sink);
    };
  }

  /** Whether a persistence sink (a ledger) is attached: an event emitted now is made durable, or the emit fails. */
  get persists(): boolean {
    return this.sinks.length > 0;
  }

  /**
   * Emits a formal event envelope: persisted first (a sink's failure propagates), then observed (a listener's
   * failure does not — except a nested emit the ledger could not persist, which is still a lost formal event).
   */
  emit<K extends EventKind>(envelope: EventEnvelope<K>): void {
    for (const sink of this.sinks) sink(envelope);
    let lost: unknown;
    for (const listener of this.listeners) {
      try {
        listener(envelope);
      } catch (e) {
        if (lost === undefined && isEventLedgerAppendFailure(e)) lost = e;
      }
    }
    if (lost !== undefined) throw lost;
  }

  /**
   * Emits an event that is already a formal envelope. EVENT-EMISSION-1: anything else is refused with
   * EVENT_ENVELOPE_INVALID, never dropped silently — a raw `{ kind, ... }` object is not an event HardKAS recorded.
   * Build envelopes with createEventEnvelope (or emitArtifactWritten for an artifact write).
   */
  normalizeAndEmit(event: any): void {
    if (validateEventEnvelope(event)) {
      this.emit(event as EventEnvelope);
      return;
    }
    const kind = event && typeof event === "object" && typeof event.kind === "string" ? event.kind : typeof event;
    throw new HardkasError(
      "EVENT_ENVELOPE_INVALID",
      `Refusing to emit "${kind}": it is not a formal event envelope (missing ${missingEnvelopeFields(event).join(", ")}). ` +
        `Build the envelope with createEventEnvelope and emit it; a raw event is never recorded.`
    );
  }

  removeAll(): void {
    this.listeners = [];
    this.sinks = [];
  }
}

export const coreEvents = new CoreEventBus();

function missingEnvelopeFields(event: any): string[] {
  if (!event || typeof event !== "object") return ["an object"];
  const missing: string[] = [];
  if (event.schema !== HardkasSchemas.Event) missing.push(`schema ${JSON.stringify(HardkasSchemas.Event)}`);
  for (const field of ["eventId", "domain", "kind", "workflowId", "correlationId", "networkId"]) {
    if (!event[field]) missing.push(field);
  }
  if (typeof event.payload !== "object") missing.push("payload");
  return missing;
}

/**
 * The correlation of an artifact nobody placed in a workflow: a documented marker, NOT a replayable causal workflow
 * identity (it is never derived from anything). An artifact that names its own workflowId is announced under it.
 */
export const STANDALONE_WORKFLOW_ID = "wf_unknown_standalone";

export interface ArtifactWrittenInput {
  /** The artifact's canonical identity (its content hash), never a label. */
  artifactId: string;
  /** Where the bytes were written. */
  absolutePath: string;
  /** Who wrote it (e.g. "sdk:artifacts-manager", "cli:tx-plan"). */
  sourceSubsystem: string;
  /** The artifact's own workflowId when it names one, or a caller's; STANDALONE_WORKFLOW_ID otherwise. */
  workflowId?: string | undefined;
  correlationId?: string | undefined;
  networkId?: string | undefined;
}

/**
 * EVENT-LEDGER-2 (D4) · the one boundary that announces an artifact HardKAS wrote: every writer (the SDK's artifact
 * manager, the CLI's direct writes, the scenario bridge) builds the same `artifact.written` envelope here and emits
 * it — persisted when a ledger is attached, or the emit fails (EL2-I0). Returns the envelope emitted.
 */
export function emitArtifactWritten(input: ArtifactWrittenInput): EventEnvelope<"artifact.written"> {
  const workflowId = input.workflowId || STANDALONE_WORKFLOW_ID;
  const envelope = createEventEnvelope({
    kind: "artifact.written",
    domain: "integrity",
    workflowId: asWorkflowId(workflowId),
    correlationId: asCorrelationId(input.correlationId || workflowId),
    networkId: asNetworkId(input.networkId || "unknown"),
    payload: { artifactId: asArtifactId(input.artifactId), path: input.absolutePath },
    sequenceNumber: asEventSequence(1),
    globalOffset: 0,
    sourceSubsystem: input.sourceSubsystem,
    artifactId: asArtifactId(input.artifactId)
  });
  coreEvents.emit(envelope);
  return envelope;
}

/** The identity of an event the ledger could not persist: what the failure names. */
export interface LostEventIdentity {
  kind: string;
  eventId: string;
  workflowId: string;
  txId?: string;
  artifactId?: string;
  path?: string;
}

function lostEventIdentity(envelope: EventEnvelope): LostEventIdentity {
  const payload: any = envelope.payload ?? {};
  const txId = envelope.txId ?? (typeof payload.txId === "string" ? payload.txId : undefined);
  const artifactId = envelope.artifactId ?? (typeof payload.artifactId === "string" ? payload.artifactId : undefined);
  return {
    kind: String(envelope.kind),
    eventId: String(envelope.eventId),
    workflowId: String(envelope.workflowId),
    ...(txId ? { txId: String(txId) } : {}),
    ...(artifactId ? { artifactId: String(artifactId) } : {}),
    ...(typeof payload.path === "string" ? { path: payload.path } : {})
  };
}

/**
 * EVENT-LEDGER-2 closeout (A1) · what the step whose event the ledger could not take had already done outside the
 * workspace, as the execution or broadcast boundary that raised the failure knows it. The failure is then reported
 * next to that effect, never as an operation that did not happen:
 *  - `accepted`: the node accepted the submission request — RPC acceptance, not acceptance or confirmation in the DAG;
 *  - `rejected`: the node answered with a rejection;
 *  - `unknown`: the submit call failed without an answer from the node, which may have received the transaction;
 *  - `executed`: the simulator executed it (the simulated state changed);
 *  - `not-performed`: the ledger failed before anything was sent or executed.
 */
export interface LedgerFailureEffect {
  operation: "broadcast" | "simulated-execution";
  outcome: "accepted" | "rejected" | "unknown" | "executed" | "not-performed";
  txId?: string | undefined;
  /** The submission (broadcast) or receipt (simulated execution) that records the effect, once it was written. */
  artifactId?: string | undefined;
  artifactPath?: string | undefined;
}

function describeEffect(effect: LedgerFailureEffect): string {
  const tx = effect.txId ? `transaction ${effect.txId}` : "the transaction";
  const recorded = effect.artifactId
    ? ` It is recorded as artifact ${effect.artifactId}${effect.artifactPath ? ` at ${effect.artifactPath}` : ""}.`
    : "";
  switch (effect.outcome) {
    case "accepted":
      return (
        `The node ACCEPTED the submission of ${tx} (acceptance of the request by the RPC, not acceptance or confirmation ` +
        `in the DAG): it WAS sent.${recorded} Do not send it again${effect.txId ? `; follow it with 'hardkas tx status ${effect.txId}'` : ""}.`
      );
    case "rejected":
      return `The node REJECTED ${tx} with an explicit answer.${recorded}`;
    case "unknown":
      return (
        `The outcome of sending ${tx} is UNKNOWN: the submit call failed without an answer from the node, which may have ` +
        `received it.${recorded} Do not send it again before checking it${effect.txId ? ` ('hardkas tx status ${effect.txId}')` : ""}.`
      );
    case "executed":
      return `The simulator EXECUTED ${tx}: the simulated state changed.${recorded} Do not execute it again.`;
    case "not-performed":
      return effect.operation === "broadcast"
        ? `Nothing was sent: the ledger failed before ${tx} was broadcast.`
        : `Nothing was executed: the ledger failed before the simulator ran ${tx}.`;
  }
}

/**
 * EVENT-LEDGER-2 (D2) · what the failure says: the EVIDENCE was not persisted, while the EFFECT of the step that
 * produced the event may already have taken place. The two are kept apart so that a non-zero exit is never read as
 * "the transaction was not sent" and repeated blindly; what is known (txId, artifact, path) is named, never a success.
 * Closeout (A1): when the boundary knows the effect, the failure leads with it.
 */
function describeLostEvent(ledgerPath: string, event: LostEventIdentity, cause: unknown, known?: LedgerFailureEffect): string {
  const why = cause instanceof Error ? cause.message : String(cause);
  const lost = `The event ${event.kind} (${event.eventId}) could not be recorded in ${ledgerPath}: ${why}`;
  const written =
    event.kind === "artifact.written" && event.path
      ? `The artifact ${event.artifactId ?? "(unknown identity)"} WAS written at ${event.path}; only its ledger entry is missing.`
      : undefined;
  if (known) {
    const tail =
      known.outcome === "not-performed"
        ? `Nothing was spooled. Free the ledger ('hardkas lock doctor'), then run the command again.`
        : `Nothing was spooled: that ledger entry stays missing${known.artifactId || written ? ", and the artifact named here is the evidence of what happened" : ""}. ` +
          `Free the ledger ('hardkas lock doctor') before running anything else in this workspace.`;
    return `${describeEffect(known)} ${lost} ${written ?? "Only its ledger entry is missing."} ${tail}`;
  }
  const effect =
    written ??
    (event.txId
      ? `Transaction ${event.txId} may already have been executed or submitted: do not send it again before checking it ` +
        `('hardkas tx status ${event.txId}'). Only its ledger entry is missing.`
      : event.artifactId
        ? `The artifact ${event.artifactId} may already exist in the workspace; only its ledger entry is missing.`
        : `The step that produced this event may already have taken effect; only its ledger entry is missing.`);
  return (
    `${lost} ${effect} ` +
    `Nothing was spooled: this event is lost unless the step is repeated. Free the ledger first ('hardkas lock doctor') ` +
    `and check the workspace evidence before repeating anything.`
  );
}

/** EVENT-LEDGER-2 (D2) · a formal event the attached ledger could not persist. Code EVENT_LEDGER_APPEND_FAILED. */
export class EventLedgerAppendError extends HardkasError {
  readonly ledgerPath: string;
  readonly event: LostEventIdentity;
  /** Closeout (A1): what the step had already done, when the boundary that raised the failure knew it. */
  readonly effect: LedgerFailureEffect | undefined;

  constructor(ledgerPath: string, envelope: EventEnvelope | LostEventIdentity, cause: unknown, effect?: LedgerFailureEffect) {
    const event = "payload" in envelope ? lostEventIdentity(envelope) : envelope;
    super("EVENT_LEDGER_APPEND_FAILED", describeLostEvent(ledgerPath, event, cause, effect), {
      cause,
      metadata: {
        ledgerPath,
        event,
        cause: { ...(typeof (cause as any)?.code === "string" ? { code: (cause as any).code } : {}), message: cause instanceof Error ? cause.message : String(cause) },
        ...(effect ? { effect } : {})
      }
    });
    this.name = "EventLedgerAppendError";
    this.ledgerPath = ledgerPath;
    this.event = event;
    this.effect = effect;
  }
}

export function isEventLedgerAppendFailure(e: unknown): e is EventLedgerAppendError {
  return typeof e === "object" && e !== null && (e as any).code === "EVENT_LEDGER_APPEND_FAILED";
}

/**
 * EVENT-LEDGER-2 closeout (A1) · at an execution or broadcast boundary: a ledger failure is rethrown naming what the
 * step had already done — same code, same lost event, same cause. An effect already named closer to the boundary is
 * kept; any other error is rethrown as it is.
 */
export function rethrowWithLedgerEffect(e: unknown, effect: LedgerFailureEffect): never {
  if (isEventLedgerAppendFailure(e) && e.effect === undefined && typeof e.ledgerPath === "string" && e.event) {
    throw new EventLedgerAppendError(e.ledgerPath, e.event, e.cause, effect);
  }
  throw e;
}

/** One ledger line: the envelope as JSON, bigint payload values (amountSompi …) as decimal strings. */
export function serializeEventForLedger(event: EventEnvelope): string {
  return JSON.stringify(event, (_key, value) => (typeof value === "bigint" ? value.toString() : value)) + "\n";
}

/**
 * Creates a formal event envelope with required metadata.
 */
export function createEventEnvelope<K extends EventKind>(params: {
  kind: K;
  domain: EventDomain;
  workflowId: WorkflowId;
  correlationId: CorrelationId;
  networkId: NetworkId;
  payload: EventPayloadByKind[K];
  causationId?: EventId;
  artifactId?: ArtifactId;
  txId?: TxId;
  eventId?: EventId;
  sequenceNumber: EventSequence;
  globalOffset?: number;
  sourceSubsystem: string;
}): EventEnvelope<K> {
  const timestamp = new Date().toISOString();
  return {
    schema: HardkasSchemas.Event,
    version: "1.0.0",
    eventId: params.eventId || (crypto.randomUUID() as EventId),
    domain: params.domain,
    kind: params.kind,
    timestamp: timestamp,
    emittedAt: timestamp,
    sourceSubsystem: params.sourceSubsystem,
    workflowId: params.workflowId,
    correlationId: params.correlationId,
    causationId: params.causationId,
    artifactId: params.artifactId,
    txId: params.txId,
    networkId: params.networkId,
    payload: params.payload,
    sequenceNumber: params.sequenceNumber,
    globalOffset: params.globalOffset
  } as EventEnvelope<K>;
}

/**
 * Lightweight runtime validation for event envelopes.
 */
export function validateEventEnvelope(event: any): boolean {
  if (!event || typeof event !== "object") return false;
  if (event.schema !== HardkasSchemas.Event) return false;
  if (!event.eventId || !event.domain || !event.kind) return false;
  if (!event.workflowId || !event.correlationId || !event.networkId) return false;
  if (typeof event.payload !== "object") return false;
  return true;
}

/**
 * Represents an unknown event payload for safety.
 */
export type UnknownEventPayload = {
  readonly type: "unknown";
  readonly data: Record<string, unknown>;
};

/**
 * WORKSPACE-AUTHORITY-1 (WA-I1) · the one place that says where a workspace's event ledger lives: `<root>/events.jsonl`,
 * where the ledger appender has always written and where every existing workspace keeps its history. The writer and
 * every reader (query, the indexer, snapshots, doctors, the dev server) take the path from here.
 */
export function eventLedgerPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "events.jsonl");
}

/**
 * A ledger some earlier code wrote under `.hardkas/` (the retired query-store appender). It is never the authority and is
 * never merged into it: readers only warn that it exists.
 */
export function legacyEventLedgerPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".hardkas", "events.jsonl");
}

/**
 * Attaches the workspace event ledger (`<root>/events.jsonl`) to the core event bus as its persistence sink.
 *
 * EVENT-LEDGER-2: every formal envelope emitted while it is attached is appended durably (AppendCoordinator: one
 * writer at a time, fsync, an abandoned lock recovered) BEFORE any listener sees it — or the emit fails with
 * EVENT_LEDGER_APPEND_FAILED (EventLedgerAppendError), naming the event and what may already have taken effect.
 * Nothing is spooled and nothing is dropped silently (EL2-I0). Idempotent per eventId within one attachment, and an
 * event counts as seen only once it is persisted (a failed append can be retried by emitting it again).
 */
export function attachLedgerAppender(workspaceRoot: string): () => void {
  const seenEventIds = new Set<string>();
  const eventsFile = eventLedgerPath(workspaceRoot);

  return coreEvents.persistWith((event) => {
    if (seenEventIds.has(event.eventId)) return;

    try {
      AppendCoordinator.appendAtomic(eventsFile, serializeEventForLedger(event), workspaceRoot);
    } catch (e) {
      throw new EventLedgerAppendError(eventsFile, event, e);
    }

    seenEventIds.add(event.eventId);
    // Prevent unbounded memory growth of seen events
    if (seenEventIds.size > 100000) {
      const iterator = seenEventIds.keys();
      for (let i = 0; i < 10000; i++) seenEventIds.delete(iterator.next().value!);
    }
  });
}

/**
 * Basic Event Subscriber based on polling (V1).
 * Abstracts the polling loop over a WalletQuery to emit events.
 */
export interface EventSubscribeOptions {
    source: any; // e.g. WalletQuery
    type: "payment";
    intervalMs: number;
    watchedAddresses: string[];
    handler: (event: any) => void;
    onError?: (err: Error) => void;
}

export class EventSubscriber {
    private activeIntervals: Map<string, NodeJS.Timeout> = new Map();

    /**
     * Subscribes to events by polling the underlying source at the specified interval.
     * Note: This is an initial V1 implementation purely based on polling.
     */
    public subscribe(options: EventSubscribeOptions): string {
        const subId = crypto.randomUUID();
        const lastSeen = new Set<string>();
        const LAST_SEEN_MAX = 10_000;

        if (options.type === "payment") {
            const interval = setInterval(async () => {
                if (!options.source.getUtxos) return;

                try {
                    const result = await options.source.getUtxos(options.watchedAddresses);
                    if (!result.ok) return;

                    for (const [address, utxos] of Object.entries(result.utxos as Record<string, any[]>)) {
                        for (const utxo of utxos) {
                            const utxoId = `${utxo.transactionId}:${utxo.outputIndex}`;
                            if (!lastSeen.has(utxoId)) {
                                if (lastSeen.size >= LAST_SEEN_MAX) lastSeen.clear();
                                lastSeen.add(utxoId);
                                options.handler({
                                    type: "payment",
                                    address,
                                    transactionId: utxo.transactionId,
                                    amountSompi: utxo.amountSompi
                                });
                            }
                        }
                    }
                } catch (e) {
                    options.onError?.(e instanceof Error ? e : new Error(String(e)));
                }
            }, options.intervalMs);

            this.activeIntervals.set(subId, interval);
        } else {
            throw new Error(`Unsupported event type: ${options.type}`);
        }

        return subId;
    }

    public unsubscribe(subId: string): void {
        const interval = this.activeIntervals.get(subId);
        if (interval) {
            clearInterval(interval);
            this.activeIntervals.delete(subId);
        }
    }
}
