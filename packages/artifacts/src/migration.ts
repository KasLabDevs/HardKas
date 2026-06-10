import { calculateContentHash, CURRENT_HASH_VERSION } from "./canonical.js";
import { ARTIFACT_VERSION } from "./schemas.js";
import { sortUtxosByOutpoint } from "./verify.js";
import { HARDKAS_VERSION } from "./constants.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents the payload of any HardKAS artifact in its raw (parsed JSON) form.
 * The migration engine operates on this untyped representation to support
 * artifacts across schema versions.
 */
export type ArtifactPayload = Record<string, unknown>;

/**
 * A single versioned migration step that transforms an artifact payload
 * from one schema version to the next.
 */
export interface MigrationStep {
  /** Source version string (e.g., "0.1.0", "1.0.0-alpha") */
  readonly fromVersion: string;
  /** Target version string */
  readonly toVersion: string;
  /** Human-readable description of what this migration does */
  readonly description: string;
  /**
   * Transform function. Receives a shallow clone of the artifact payload
   * and returns the migrated payload. MUST NOT mutate the input.
   */
  transform(artifact: ArtifactPayload): ArtifactPayload;
}

/**
 * Result of a migration operation.
 */
export interface MigrationResult {
  /** The migrated artifact payload */
  artifact: ArtifactPayload;
  /** Whether any migration was actually applied */
  migrated: boolean;
  /** The original content hash (before migration), preserved for lineage */
  originalContentHash: string | undefined;
  /** Ordered list of migration steps that were applied */
  appliedSteps: ReadonlyArray<{
    fromVersion: string;
    toVersion: string;
    description: string;
  }>;
}

export class MigrationRequiredError extends Error {
  constructor(
    public oldVersion: string,
    public targetVersion: string
  ) {
    super(
      `MIGRATION_REQUIRED: Artifact requires explicit migration from ${oldVersion} to ${targetVersion}`
    );
    this.name = "MigrationRequiredError";
  }
}

// ---------------------------------------------------------------------------
// Migration Registry
// ---------------------------------------------------------------------------

/**
 * Internal registry of all known migration steps.
 * Steps are registered at module load time and ordered by version.
 */
const migrationRegistry: MigrationStep[] = [];

/**
 * Registers a migration step in the global registry.
 * Steps should be registered in chronological order (oldest → newest).
 *
 * @param step - The migration step to register
 */
export function registerMigrationStep(step: MigrationStep): void {
  // Validate no duplicate from→to pair
  const existing = migrationRegistry.find(
    (s) => s.fromVersion === step.fromVersion && s.toVersion === step.toVersion
  );
  if (existing) {
    throw new Error(
      `Duplicate migration step: ${step.fromVersion} → ${step.toVersion} already registered`
    );
  }
  migrationRegistry.push(step);
}

/**
 * Returns all registered migration steps (read-only copy).
 */
export function getRegisteredMigrationSteps(): ReadonlyArray<MigrationStep> {
  return [...migrationRegistry];
}

// ---------------------------------------------------------------------------
// Built-in Migration Steps
// ---------------------------------------------------------------------------

/**
 * Migration: legacy v1 artifacts → 1.0.0-alpha
 *
 * Handles the transition from the original `.v1` suffixed schemas to the
 * current canonical format.
 */
registerMigrationStep({
  fromVersion: "0.1.0",
  toVersion: ARTIFACT_VERSION,
  description: "Legacy v1 schemas to canonical 1.0.0-alpha format",
  transform(artifact: ArtifactPayload): ArtifactPayload {
    const migrated = { ...artifact };
    if (migrated.lineage) {
      migrated.lineage = { ...(migrated.lineage as object) };
    }

    // 1. Strip .v1 suffix from schema names
    if (typeof migrated.schema === "string" && migrated.schema.endsWith(".v1")) {
      // Preserve workflow schema as-is (hardkas.workflow.v1 is the canonical name)
      if (migrated.schema !== "hardkas.workflow.v1") {
        migrated.schema = migrated.schema.replace(/\.v1$/, "");
      }
    }

    // 2. Update version to current
    migrated.version = ARTIFACT_VERSION;

    // 3. Schema-specific field renames
    if (migrated.schema === "hardkas.txPlan" && migrated.selectedUtxos !== undefined) {
      migrated.inputs = migrated.selectedUtxos;
      delete migrated.selectedUtxos;
    }

    // 4. Sort UTXOs deterministically for snapshot artifacts
    if (migrated.schema === "hardkas.snapshot" && Array.isArray(migrated.utxos)) {
      migrated.utxos = sortUtxosByOutpoint(migrated.utxos as unknown[]);
    }

    // 5. Ensure required base fields
    if (!migrated.hardkasVersion) {
      migrated.hardkasVersion = HARDKAS_VERSION;
    }
    if (!migrated.createdAt) {
      migrated.createdAt = new Date().toISOString();
    }

    // 6. Ensure hashVersion is set to current
    if (migrated.hashVersion === undefined || migrated.hashVersion === null) {
      migrated.hashVersion = CURRENT_HASH_VERSION;
    }

    return migrated;
  }
});

// ---------------------------------------------------------------------------
// Path Resolution
// ---------------------------------------------------------------------------

/**
 * Determines the version of an artifact based on its `version` field,
 * falling back to heuristics for truly legacy artifacts.
 */
export function detectArtifactVersion(artifact: ArtifactPayload): string {
  // Explicit version field
  if (typeof artifact.version === "string" && artifact.version.length > 0) {
    return artifact.version;
  }

  // Heuristic: if schema has .v1 suffix, it's a legacy artifact
  if (typeof artifact.schema === "string" && artifact.schema.endsWith(".v1")) {
    return "0.1.0";
  }

  // Unknown — treat as needing migration from earliest known version
  return "0.1.0";
}

/**
 * Resolves the ordered list of migration steps needed to go from
 * `fromVersion` to `toVersion`.
 *
 * Uses a simple BFS/chain walk through the migration registry.
 * Returns an empty array if no migration path exists or if the artifact
 * is already at the target version.
 *
 * @param fromVersion - The current artifact version
 * @param toVersion - The desired target version
 * @returns Ordered array of migration steps, or empty if no path or already current
 */
export function getMigrationPath(
  fromVersion: string,
  toVersion: string
): ReadonlyArray<MigrationStep> {
  if (fromVersion === toVersion) {
    return [];
  }

  // BFS to find the shortest path through the migration graph
  const visited = new Set<string>();
  const queue: Array<{ version: string; path: MigrationStep[] }> = [
    { version: fromVersion, path: [] }
  ];

  visited.add(fromVersion);

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Find all steps FROM the current version
    const outgoing = migrationRegistry.filter((s) => s.fromVersion === current.version);

    for (const step of outgoing) {
      const newPath = [...current.path, step];

      if (step.toVersion === toVersion) {
        return newPath;
      }

      if (!visited.has(step.toVersion)) {
        visited.add(step.toVersion);
        queue.push({ version: step.toVersion, path: newPath });
      }
    }
  }

  // No path found
  return [];
}

/**
 * Checks whether a migration path exists from the artifact's current
 * version to the target version.
 *
 * @param artifact - The artifact payload to check
 * @param targetVersion - The desired target version (defaults to ARTIFACT_VERSION)
 * @returns `true` if a migration path exists or the artifact is already at the target version
 */
export function canMigrate(
  artifact: ArtifactPayload,
  targetVersion: string = ARTIFACT_VERSION
): boolean {
  const currentVersion = detectArtifactVersion(artifact);

  // Already at target
  if (currentVersion === targetVersion) {
    return true;
  }

  const path = getMigrationPath(currentVersion, targetVersion);
  return path.length > 0;
}

// ---------------------------------------------------------------------------
// Core Migration Function
// ---------------------------------------------------------------------------

/**
 * Migrates an artifact payload from its current schema version to the
 * specified target version.
 *
 * **Identity Preservation:**
 * - The original `contentHash` is preserved as `originalContentHash`
 * - The `lineage.rootArtifactId` is NEVER modified
 * - A new `contentHash` is computed after migration using `CURRENT_HASH_VERSION`
 *
 * **Non-Destructive:**
 * - The input artifact object is never mutated
 * - The canonical artifact file on disk is never modified
 * - Migration produces a new in-memory representation only
 *
 * @param artifact - The artifact payload to migrate
 * @param targetVersion - The desired target version (defaults to ARTIFACT_VERSION)
 * @returns MigrationResult with the migrated artifact and metadata
 * @throws Error if no migration path exists
 *
 * @example
 * ```typescript
 * const result = migrateArtifactPayload(legacyArtifact);
 * if (result.migrated) {
 *   console.log(`Migrated from ${result.appliedSteps[0].fromVersion}`);
 *   console.log(`Original hash preserved: ${result.originalContentHash}`);
 * }
 * ```
 */
export function migrateArtifactPayload(
  artifact: ArtifactPayload,
  targetVersion: string = ARTIFACT_VERSION,
  options?: { strictPolicy?: boolean }
): MigrationResult {
  const currentVersion = detectArtifactVersion(artifact);

  // Already at target version — no migration needed
  if (currentVersion === targetVersion) {
    return {
      artifact,
      migrated: false,
      originalContentHash: artifact.contentHash as string | undefined,
      appliedSteps: []
    };
  }

  if (options?.strictPolicy) {
    throw new MigrationRequiredError(currentVersion, targetVersion);
  }

  // Resolve migration path
  const path = getMigrationPath(currentVersion, targetVersion);
  if (path.length === 0) {
    throw new Error(
      `No migration path from version "${currentVersion}" to "${targetVersion}". ` +
        `Registered steps: [${migrationRegistry.map((s) => `${s.fromVersion}→${s.toVersion}`).join(", ")}]`
    );
  }

  // Preserve original identity
  const originalContentHash = artifact.contentHash as string | undefined;
  const originalLineage = artifact.lineage as Record<string, unknown> | undefined;

  // Apply each migration step sequentially
  let current: ArtifactPayload = { ...artifact };
  const appliedSteps: Array<{
    fromVersion: string;
    toVersion: string;
    description: string;
  }> = [];

  for (const step of path) {
    current = step.transform(current);
    appliedSteps.push({
      fromVersion: step.fromVersion,
      toVersion: step.toVersion,
      description: step.description
    });
  }

  // Preserve original content hash for lineage tracing
  if (originalContentHash) {
    current.originalContentHash = originalContentHash;
  }

  // Preserve lineage root identity — INVARIANT: schema_upgrade_preserves_lineage
  if (originalLineage && typeof originalLineage === "object") {
    const migratedLineage = current.lineage as Record<string, unknown> | undefined;
    if (migratedLineage && typeof migratedLineage === "object") {
      // Root artifact ID must NEVER change during migration
      migratedLineage.rootArtifactId = originalLineage.rootArtifactId;
      // Link back to the original artifact for lineage tracing
      if (originalContentHash) {
        migratedLineage.parentArtifactId = originalContentHash;
      }
    }
  }

  // Recalculate content hash with current hash version (double-pass)
  current.hashVersion = CURRENT_HASH_VERSION;
  let hash = calculateContentHash(current, CURRENT_HASH_VERSION);
  // Update lineage.artifactId to match the new contentHash, then recalculate
  if (current.lineage && typeof current.lineage === "object") {
    (current.lineage as Record<string, unknown>).artifactId = hash;
    hash = calculateContentHash(current, CURRENT_HASH_VERSION);
  }
  current.contentHash = hash;

  return {
    artifact: current,
    migrated: true,
    originalContentHash,
    appliedSteps
  };
}

// ---------------------------------------------------------------------------
// Legacy Compatibility
// ---------------------------------------------------------------------------

/**
 * Migrates a v1 artifact to canonical format by updating the schema, version,
 * and calculating the contentHash.
 *
 * @deprecated Use `migrateArtifactPayload()` instead. This function is retained
 * for backward compatibility with existing callers.
 *
 * @param v1Artifact - The legacy v1 artifact to migrate
 * @returns The migrated artifact in canonical format
 */
export function migrateToCanonical(v1Artifact: ArtifactPayload): ArtifactPayload {
  if (v1Artifact.version === ARTIFACT_VERSION) {
    return v1Artifact; // Already canonical
  }

  const result = migrateArtifactPayload(v1Artifact, ARTIFACT_VERSION);
  return result.artifact;
}

/**
 * Generates an explicit MigrationReceipt connecting old artifact to new artifact.
 */
export function generateMigrationReceipt(
  oldArtifact: ArtifactPayload,
  newArtifact: ArtifactPayload,
  migrationId: string
): any {
  const oldHash =
    (oldArtifact.contentHash as string) ||
    calculateContentHash(oldArtifact, CURRENT_HASH_VERSION);
  const newHash =
    (newArtifact.contentHash as string) ||
    calculateContentHash(newArtifact, CURRENT_HASH_VERSION);

  const receipt: any = {
    schema: "hardkas.migrationReceipt.v1",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    networkId: (oldArtifact.networkId as string) || "simnet",
    mode: (oldArtifact.mode as string) || "simulated",
    createdAt: new Date().toISOString(),
    oldHash,
    newHash,
    fromSchema: (oldArtifact.schema as string) || "unknown",
    toSchema: (newArtifact.schema as string) || "unknown",
    migrationId,
    decision: "MIGRATED_WITH_PROOF",
    lineage: {
      artifactId: "", // Filled after hash
      lineageId:
        ((oldArtifact.lineage as any)?.lineageId as string) ||
        ("migration" + oldHash).padEnd(64, "0").slice(0, 64),
      parentArtifactId: oldHash,
      rootArtifactId: ((oldArtifact.lineage as any)?.rootArtifactId as string) || oldHash
    }
  };

  receipt.contentHash = calculateContentHash(receipt, CURRENT_HASH_VERSION);
  receipt.lineage.artifactId = receipt.contentHash;

  // We DO NOT mutate newArtifact to point to the receipt because that would
  // create a circular hash dependency (receipt needs newArtifact hash, newArtifact needs receipt hash).
  // newArtifact's parent is simply oldArtifact.

  return receipt;
}
