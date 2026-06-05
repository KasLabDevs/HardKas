import { TelemetryManager, globalTelemetry } from "./telemetry.js";

export interface DeterministicClock {
  now(): number;
}

export interface DeterministicRandom {
  next(): number;
}

export interface IdProvider {
  execution(): string;
  workflow(): string;
}

export interface RuntimeContext {
  clock: DeterministicClock;
  random: DeterministicRandom;
  ids: IdProvider;
  telemetry: TelemetryManager;
  workflowId?: string;
  assumptionLevel?: string;
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
    execution: () => `exec_${Date.now().toString(36)}`,
    workflow: () => `wf_${Date.now().toString(36)}`
  },
  telemetry: globalTelemetry
};
