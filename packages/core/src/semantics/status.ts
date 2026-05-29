import { ArtifactStatus } from "./types.js";

/**
 * Valid transitions within the Artifact Status Lattice.
 * The key is the 'from' status, the values are the allowed 'to' statuses.
 */
const LEGAL_TRANSITIONS: Record<ArtifactStatus, ReadonlyArray<ArtifactStatus>> = {
  UNKNOWN: ["PROJECTED", "QUARANTINED", "CORRUPTED"],
  PROJECTED: ["VERIFIED", "CORRUPTED"],
  VERIFIED: ["STALE", "REPLAY_VERIFIED", "CORRUPTED"],
  STALE: ["VERIFIED", "REPLAY_VERIFIED", "CORRUPTED"],
  REPLAY_VERIFIED: ["STALE", "CORRUPTED"],
  CORRUPTED: ["QUARANTINED"],
  QUARANTINED: [] // Terminal state
};

/**
 * Throws a loud runtime error if a transition is invalid.
 * Invariant: `artifact_status_transitions_are_semantically_valid`
 */
export function validateStatusTransition(from: ArtifactStatus, to: ArtifactStatus): void {
  if (from === to) return; // No-op

  const allowed = LEGAL_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(
      `[CRITICAL SEMANTIC ERROR] Illegal artifact status transition attempted: ${from} -> ${to}. ` +
        `This is a violation of the semantic artifact status lattice.`
    );
  }
}
