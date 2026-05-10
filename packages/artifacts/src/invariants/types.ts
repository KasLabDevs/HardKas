import { EventEnvelope } from "@hardkas/core";
import { Clock } from "../verify.js";

/**
 * Invariant Violation details.
 */
export interface InvariantViolation {
  code: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Interface for looking up artifacts during invariant checks.
 */
export interface ArtifactLookup {
  getArtifact(idOrHash: string): Promise<unknown | null>;
}

/**
 * Context provided to invariant checks.
 * Uses unknown + narrowing instead of any.
 */
export interface InvariantContext {
  artifact?: unknown;
  event?: EventEnvelope;
  artifactStore?: ArtifactLookup | undefined;
  clock?: Clock;
  strict?: boolean;
}

/**
 * Core Invariant interface.
 */
export interface Invariant {
  readonly id: string;
  readonly description: string;
  check(context: InvariantContext): Promise<InvariantViolation[]>;
}
