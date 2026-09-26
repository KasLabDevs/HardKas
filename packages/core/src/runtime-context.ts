import { TelemetryManager, globalTelemetry } from "./telemetry.js";

export interface DeterministicClock {
  now(): number;
}

export interface DeterministicRandom {
  next(): number;
}

export interface IdProvider {
  execution(): string;
  /**
   * Optional. A `workflowId` has ONE derivation (Closure Pack IC-7.4):
   * `deriveWorkflowId` in @hardkas/artifacts over a typed intent. No ambient
   * generator produces one; contexts that still supply this hook do so for
   * their own correlation only.
   */
  workflow?(): string;
}

export interface RuntimeContext {
  clock: DeterministicClock;
  random: DeterministicRandom;
  ids: IdProvider;
  telemetry: TelemetryManager;
  workflowId?: string;
  assumptionLevel?: string;
  utxoSelection?: {
    totalUtxosSeen: number;
    selectedUtxos: number;
    selectionStrategy: string;
  };
  /**
   * Planner authority carried through from the tx-builder result at plan time.
   * `KASPA_WASM_GENERATOR` = real Kaspa execution (kaspa-wasm 2.x upstream Generator).
   * `SYNTHETIC_SIMULATOR` = HardKAS-owned synthetic planner for the developer harness.
   * Absence = authority not established; NEVER synthesize a value downstream.
   */
  plannerAuthority?: "KASPA_WASM_GENERATOR" | "SYNTHETIC_SIMULATOR";
  /** Human-readable authority detail, e.g. `kaspa-wasm@2.0.1`. Optional. */
  plannerAuthorityDetail?: string;
  /**
   * Wave 2(c) · AUD-19: the mempool observation the planner's snapshot was filtered
   * against (observer-local evidence, recorded in the plan). Absence = no pending-spend
   * exclusion was applied (simulator, or a planner path that does not read a mempool).
   */
  pendingSpendEvidence?: {
    source: "mempool";
    scope: "observer-local";
    address: string;
    observedAtDaaScore?: string;
    sendingEntries: number;
    excludedOutpoints: string[];
    guarantee: string;
  };
}

/**
 * A default system runtime context (for non-deterministic contexts like dev server or CLI entry points)
 * This should NOT be used directly in pure canonical domain logic (e.g. artifacts, replays).
 */
export const systemRuntimeContext: RuntimeContext = {
  clock: {
    now: () => Date.now()
  },
  random: {
    next: () => Math.random()
  },
  ids: {
    execution: () => `exec_${Date.now().toString(36)}`
  },
  telemetry: globalTelemetry
};
