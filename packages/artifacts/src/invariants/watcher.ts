import { Invariant, InvariantContext, InvariantViolation, ArtifactLookup } from "./types.js";
import { EventEnvelope, createEventEnvelope } from "@hardkas/core";

export interface WatcherOptions {
  invariants: Invariant[];
  eventBus: {
    subscribe(callback: (event: EventEnvelope) => void): () => void;
    emit(event: EventEnvelope): void;
  };
  artifactStore?: ArtifactLookup | undefined;
}

/**
 * Lightweight, opt-in watcher for system invariants.
 * Listens to the event bus and performs validation.
 * Non-global, non-singleton.
 */
export class InvariantWatcher {
  private invariants: Invariant[];
  private eventBus: WatcherOptions["eventBus"];
  private artifactStore?: ArtifactLookup | undefined;
  private unsubscribe: (() => void) | null = null;

  constructor(options: WatcherOptions) {
    this.invariants = options.invariants;
    this.eventBus = options.eventBus;
    this.artifactStore = options.artifactStore;
  }

  /**
   * Starts watching for events.
   */
  public start(): void {
    if (this.unsubscribe) return;
    
    this.unsubscribe = this.eventBus.subscribe(async (event: EventEnvelope) => {
      // 1. Avoid event loops: do not react to integrity events by default
      if (event.domain === "integrity") return;

      // 2. Prepare context
      const context: InvariantContext = {
        event,
        artifactStore: this.artifactStore ?? undefined,
      };

      // 3. Run all registered invariants
      for (const invariant of this.invariants) {
        try {
          const violations = await invariant.check(context);
          for (const violation of violations) {
            this.emitViolation(event, violation);
          }
        } catch (e) {
          // Invariant check failure should not crash the watcher
          console.error(`Invariant ${invariant.id} failed with error:`, e);
        }
      }
    });
  }

  /**
   * Stops watching and clears subscriptions.
   */
  public stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Alias for stop().
   */
  public dispose(): void {
    this.stop();
  }

  private emitViolation(sourceEvent: EventEnvelope, violation: InvariantViolation): void {
    // 4. Emit integrity violation as EventEnvelope
    const integrityEvent = createEventEnvelope({
      kind: "integrity.violation",
      domain: "integrity",
      workflowId: sourceEvent.workflowId,
      correlationId: sourceEvent.correlationId,
      networkId: sourceEvent.networkId,
      payload: {
        violationCode: violation.code,
        severity: violation.severity,
        message: violation.message,
        metadata: violation.metadata,
        sourceEventId: sourceEvent.eventId as string
      }
    });
    
    this.eventBus.emit(integrityEvent);
  }
}
