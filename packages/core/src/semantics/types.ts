/**
 * Formal Artifact Status Lattice
 *
 * UNKNOWN: Unreadable, ambiguous, partially classified, migration-pending states.
 * PROJECTED: An artifact read from disk / state whose truth has not yet been verified.
 * STALE: An artifact whose dependencies/lineage has drifted since it was verified.
 * VERIFIED: Integrity, signature, and internal capability constraints are verified.
 * REPLAY_VERIFIED: Full lineage and determinism verified via an active replay.
 * CORRUPTED: Irreparable semantic or cryptographic corruption detected.
 * QUARANTINED: Corrupted or malicious artifact safely isolated from runtime.
 */
export type ArtifactStatus =
  | "UNKNOWN"
  | "PROJECTED"
  | "STALE"
  | "VERIFIED"
  | "REPLAY_VERIFIED"
  | "CORRUPTED"
  | "QUARANTINED";

/**
 * Baseline schema version is 1.
 */
export type SchemaVersion = 1;

export interface SemanticIdentity {
  /** The unique artifact ID */
  artifactId: string;
  /** The semantic hash of the artifact content */
  semanticHash: string;
  /** Formal schema version */
  schemaVersion: SchemaVersion;
  /** Current status in the lattice */
  status: ArtifactStatus;
}
