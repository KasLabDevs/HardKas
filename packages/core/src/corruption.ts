/**
 * HardKAS Corruption Taxonomy & Issue Reporting
 */

export type CorruptionCode =
  | "ARTIFACT_JSON_INVALID"
  | "ARTIFACT_SCHEMA_MISSING"
  | "ARTIFACT_SCHEMA_INVALID"
  | "ARTIFACT_HASH_MISMATCH"
  | "ARTIFACT_ID_INVALID"
  | "ARTIFACT_LINEAGE_INVALID"
  | "EVENT_JSON_INVALID"
  | "EVENT_SCHEMA_INVALID"
  | "EVENT_LINE_CORRUPT"
  | "STORE_STALE"
  | "STORE_CORRUPT"
  | "STORE_REBUILD_REQUIRED"
  | "DUPLICATE_ARTIFACT"
  | "DUPLICATE_EVENT"
  | "SEMANTIC_DIVERGENCE"
  | "REPLAY_PARTIAL"
  | "REPLAY_UNSUPPORTED_CHECK"
  | "LOCK_HELD"
  | "LOCK_TIMEOUT"
  | "STALE_LOCK"
  | "LOCK_RELEASE_FAILED"
  | "LOCK_OWNER_MISMATCH"
  | "LOCK_METADATA_INVALID"
  | "STORE_MIGRATION_REQUIRED"
  | "STORE_MIGRATION_FAILED"
  | "STORE_MIGRATION_CHECKSUM_MISMATCH"
  | "STORE_SCHEMA_UNSUPPORTED"
  | "STORE_LEGACY_BOOTSTRAPPED";

export type CorruptionSeverity = "warning" | "error";

export interface CorruptionIssue {
  readonly code: CorruptionCode;
  readonly severity: CorruptionSeverity;
  readonly message: string;
  readonly path?: string;
  readonly lineNumber?: number;
  readonly artifactId?: string;
  readonly contentHash?: string;
  readonly suggestion?: string;
}

/**
 * Formats a corruption issue for human-readable output.
 */
export function formatCorruptionIssue(issue: CorruptionIssue): string {
  const parts: string[] = [];
  
  const icon = issue.severity === "error" ? "❌" : "⚠️";
  parts.push(`${icon} [${issue.code}] ${issue.message}`);
  
  if (issue.path) {
    const loc = issue.lineNumber ? `${issue.path}:${issue.lineNumber}` : issue.path;
    parts.push(`   Location: ${loc}`);
  }
  
  if (issue.artifactId) {
    parts.push(`   Artifact: ${issue.artifactId}`);
  }
  
  if (issue.suggestion) {
    parts.push(`   Suggestion: ${issue.suggestion}`);
  }
  
  return parts.join("\n");
}
