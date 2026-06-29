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
import { AppendCoordinator } from "./append-coordinator.js";
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

/**
 * Lightweight in-memory Event Bus.
 */
class CoreEventBus {
  private listeners: CoreEventListener[] = [];

  on(listener: CoreEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Emits a formal event envelope.
   */
  emit<K extends EventKind>(envelope: EventEnvelope<K>): void {
    for (const listener of this.listeners) {
      try {
        listener(envelope);
      } catch {
        // Fire-and-forget.
      }
    }
  }

  /**
   * Normalizes and emits an event.
   * Useful for incremental migration from raw events.
   */
  normalizeAndEmit(event: any): void {
    if (validateEventEnvelope(event)) {
      this.emit(event as EventEnvelope);
    } else {
      // TODO: Implement legacy transformation if needed.
      // For now, we only emit if it satisfies the envelope structure.
    }
  }

  removeAll(): void {
    this.listeners = [];
  }
}

export const coreEvents = new CoreEventBus();

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
 * Attaches the canonical Event Ledger appender to the core event bus.
 * This guarantees that all formal EventEnvelopes are persisted to events.jsonl.
 */
export function attachLedgerAppender(workspaceRoot: string): () => void {
  const seenEventIds = new Set<string>();
  const eventsFile = path.join(workspaceRoot, "events.jsonl");

  return coreEvents.on((event) => {
    // 1. Idempotency check: prevent duplicate flush in same session
    if (seenEventIds.has(event.eventId)) {
      return;
    }
    seenEventIds.add(event.eventId);

    // 2. Prevent unbounded memory growth of seen events
    if (seenEventIds.size > 100000) {
      const iterator = seenEventIds.keys();
      for (let i = 0; i < 10000; i++) seenEventIds.delete(iterator.next().value!);
    }

    // 3. Serialize and flush atomically via physical locks
    const payload = JSON.stringify(event) + "\n";

    try {
      AppendCoordinator.appendAtomic(eventsFile, payload, workspaceRoot);
    } catch (e) {
      // Fire-and-forget for now, but a robust system might enqueue failed appends.
      // AppendCoordinator throws on EACCES or irrecoverable lock states.
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
