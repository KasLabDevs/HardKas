// SAFETY_LEVEL: SIMULATION_ONLY
//
// Transaction lifecycle phase simulator.
// Original @hardkas/simulator content — kept as-is.

export type TxLifecyclePhase =
  | "build"
  | "resolve-account"
  | "resolve-utxos"
  | "select-utxos"
  | "estimate-mass"
  | "estimate-fee"
  | "sign"
  | "validate-local"
  | "submit"
  | "mempool"
  | "included"
  | "confirmed"
  | "finalized";

export type TxTraceEvent =
  | {
      readonly type: "phase.started";
      readonly phase: TxLifecyclePhase;
      readonly timestamp: number;
    }
  | {
      readonly type: "phase.completed";
      readonly phase: TxLifecyclePhase;
      readonly timestamp: number;
    }
  | {
      readonly type: "tx.failed";
      readonly phase: TxLifecyclePhase;
      readonly reason: string;
      readonly timestamp: number;
    }
  | {
      readonly type: "note";
      readonly message: string;
      readonly timestamp: number;
    };

export interface SimulationResult {
  readonly ok: boolean;
  readonly events: readonly TxTraceEvent[];
}

export class TxSimulator {
  async simulate(
    phases: readonly TxLifecyclePhase[],
    run?: (phase: TxLifecyclePhase) => Promise<void>
  ): Promise<SimulationResult> {
    const events: TxTraceEvent[] = [];

    for (const phase of phases) {
      events.push({ type: "phase.started", phase, timestamp: Date.now() });

      try {
        if (run) await run(phase);
      } catch (error) {
        events.push({
          type: "tx.failed",
          phase,
          reason: error instanceof Error ? error.message : "Unknown error",
          timestamp: Date.now(),
        });
        return { ok: false, events };
      }

      events.push({ type: "phase.completed", phase, timestamp: Date.now() });
    }

    return { ok: true, events };
  }
}

/**
 * Creates a non-deterministic trace ID for debug purposes.
 * Intentionally uses Date.now() + Math.random().
 * Trace IDs are debug metadata only — they do NOT enter
 * canonical hashing or artifact identity.
 */
export function createTraceId(prefix = "trace"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
