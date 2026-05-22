import { ArtifactId } from "./domain-types.js";

export type IntegrityStatus = "verified" | "corrupted" | "invalid_json" | "unknown";

/**
 * Explains the causal origin and validation state of a derived value.
 */
export interface StateProvenance {
  /**
   * The architectural authority that asserts this state (e.g. "query-store projection", "filesystem artifact", "memory cache")
   */
  authority: string;

  /**
   * The source artifact ID from which this state was derived (if applicable)
   */
  derivedFrom?: ArtifactId;

  /**
   * The absolute or relative file path of the source artifact
   */
  originalPath?: string;

  /**
   * Current deterministic integrity of the source
   */
  integrity: IntegrityStatus;

  /**
   * The replay scope indicating where this state is valid (e.g., "local-only", "global")
   */
  replayScope: "local-only" | "global" | "unknown";

  /**
   * True if this state has been independently verified against network consensus
   */
  consensusValidated: boolean;
}
