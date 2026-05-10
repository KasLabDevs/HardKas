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
  | "l2.withdrawal.planned";

/**
 * Payload mapping for each event kind.
 */
export interface EventPayloadByKind {
  "workflow.plan.created": { planId: ArtifactId; network: NetworkId; amountSompi: bigint };
  "workflow.signed": { signedId: ArtifactId; planId: ArtifactId; txId?: TxId };
  "workflow.submitted": { txId: TxId; rpcUrl: string };
  "workflow.receipt": { txId: TxId; status: "accepted" | "finalized" | "failed"; daaScore?: DaaScore };
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
  "rpc.stale": { endpoint: RpcEndpointId; lastDaaScore: DaaScore; currentDaaScore: DaaScore };
  
  "replay.divergence": { txId: TxId; field: string; expected: string; actual: string };
  "replay.verified": { txId: TxId; lineageId: LineageId };

  "localnet.started": { mode: string; networkId: NetworkId };
  "localnet.stopped": { reason: string };

  "l2.deposit.planned": { asset: string; amount: bigint; to: string };
  "l2.withdrawal.planned": { asset: string; amount: bigint; from: string };
}

/**
 * Formal Event Envelope (v1).
 * 
 * Standardizes how events are captured and tracked across the system.
 */
export interface EventEnvelope<K extends EventKind = EventKind> {
  schema: "hardkas.event";
  version: "1.0.0";

  eventId: EventId;
  domain: EventDomain;
  kind: K;

  timestamp: string;
  sequence?: EventSequence | undefined;

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
      this.listeners = this.listeners.filter(l => l !== listener);
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
  sequence?: EventSequence;
}): EventEnvelope<K> {
  return {
    schema: "hardkas.event",
    version: "1.0.0",
    eventId: params.eventId || (crypto.randomUUID() as EventId),
    domain: params.domain,
    kind: params.kind,
    timestamp: new Date().toISOString(),
    workflowId: params.workflowId,
    correlationId: params.correlationId,
    causationId: params.causationId,
    artifactId: params.artifactId,
    txId: params.txId,
    networkId: params.networkId,
    payload: params.payload,
    ...(params.sequence !== undefined ? { sequence: params.sequence } : {})
  } as EventEnvelope<K>;
}

/**
 * Lightweight runtime validation for event envelopes.
 */
export function validateEventEnvelope(event: any): boolean {
  if (!event || typeof event !== "object") return false;
  if (event.schema !== "hardkas.event") return false;
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
