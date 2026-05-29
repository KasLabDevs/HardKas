import { SemanticIdentity, SchemaVersion } from "./types.js";

export interface MigrationResult {
  migratedIdentity: SemanticIdentity;
  success: boolean;
  error?: string;
}

/**
 * Validates that an artifact migration preserves identity and lineage semantics.
 * Invariant: `schema_evolution_preserves_semantic_identity`
 */
export function verifyMigrationIntegrity(
  preMigration: SemanticIdentity,
  postMigration: SemanticIdentity
): void {
  if (preMigration.artifactId !== postMigration.artifactId) {
    throw new Error(
      `[CRITICAL SEMANTIC ERROR] Migration unexpectedly altered canonical artifact ID: ${preMigration.artifactId} -> ${postMigration.artifactId}`
    );
  }

  if (postMigration.schemaVersion < preMigration.schemaVersion) {
    throw new Error(
      `[CRITICAL SEMANTIC ERROR] Invalid migration: schema downgraded from ${preMigration.schemaVersion} to ${postMigration.schemaVersion}`
    );
  }
}

/**
 * Handles migrating an artifact to a newer schema version.
 * Currently, only schemaVersion: 1 exists as the baseline.
 */
export function migrateArtifact(
  identity: SemanticIdentity,
  targetVersion: SchemaVersion
): MigrationResult {
  if (identity.schemaVersion === targetVersion) {
    return { migratedIdentity: identity, success: true };
  }

  // Future migration logic goes here
  return {
    migratedIdentity: identity,
    success: false,
    error: `No migration path from ${identity.schemaVersion} to ${targetVersion}`
  };
}

/**
 * Compares lineage before and after migration to ensure continuity.
 */
export function comparePrePostMigrationLineage(
  preLineageId: string,
  postLineageId: string
): void {
  if (preLineageId !== postLineageId) {
    throw new Error(
      `[CRITICAL SEMANTIC ERROR] Lineage broken across schema migration: ${preLineageId} -> ${postLineageId}`
    );
  }
}
