import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  legacyUnauthenticatedMaterialFields,
  readDeclaredHashVersion,
  V5_DERIVED_LABELS
} from "./canonical.js";
import { ARTIFACT_VERSION } from "./schemas.js";
import { sortUtxosByOutpoint, verifyArtifactIntegritySync } from "./verify.js";
import { HARDKAS_VERSION } from "./constants.js";
import { HardkasSchemas } from "@hardkas/core";

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

export type MigrationErrorCode =
  | "MIGRATION_SOURCE_INVALID"
  | "MIGRATION_NOT_NEEDED"
  | "MIGRATION_TARGET_UNSUPPORTED"
  | "MIGRATION_UNVERIFIED_REQUIRED_FIELDS"
  | "MIGRATION_RESULT_INVALID"
  | "HASH_VERSION_INVALID";

/** A typed refusal of the migration engine (Closure Pack D-Q1.f / IC-4′.7). */
export class MigrationError extends Error {
  readonly code: MigrationErrorCode;
  readonly fields: string[];
  readonly issues: Array<{ code: string; message: string }>;
  constructor(
    code: MigrationErrorCode,
    message: string,
    details: { fields?: string[]; issues?: Array<{ code: string; message: string }> } = {}
  ) {
    super(`${code}: ${message}`);
    this.name = "MigrationError";
    this.code = code;
    this.fields = details.fields ?? [];
    this.issues = details.issues ?? [];
  }
}

/**
 * The block a migrated artifact carries for the material fields its source
 * version never authenticated (IC-4′.7): recorded as an UNVERIFIED legacy claim,
 * never re-issued as authenticated content.
 */
export interface LegacyClaims {
  sourceHashVersion: number;
  sourceArtifactId: string;
  verified: false;
  note: string;
  fields: Record<string, unknown>;
}

const LEGACY_CLAIMS_NOTE =
  "Values the source artifact carried in fields its hash version never authenticated. They are recorded as the source's claim, not verified by this artifact.";

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
      if (migrated.schema !== HardkasSchemas.WorkflowV1) {
        migrated.schema = migrated.schema.replace(/\.v1$/, "");
      }
    }

    // 2. Update version to current
    migrated.version = ARTIFACT_VERSION;

    // 3. Schema-specific field renames
    if (migrated.schema === HardkasSchemas.TxPlan && migrated.selectedUtxos !== undefined) {
      migrated.inputs = migrated.selectedUtxos;
      delete migrated.selectedUtxos;
    }

    // 4. Sort UTXOs deterministically for snapshot artifacts
    if (migrated.schema === HardkasSchemas.Snapshot && Array.isArray(migrated.utxos)) {
      migrated.utxos = sortUtxosByOutpoint(migrated.utxos as unknown[]);
    }

    // 5. Ensure required base fields
    if (!migrated.hardkasVersion) {
      migrated.hardkasVersion = HARDKAS_VERSION;
    }
    if (!migrated.createdAt) {
      migrated.createdAt = new Date().toISOString();
    }

    // 6. Execution identity: a deterministic function of fields the legacy schema
    //    already carried (mode, networkId); no claim is invented.
    if (
      migrated.execution === undefined &&
      typeof migrated.mode === "string" &&
      typeof migrated.networkId === "string" &&
      (migrated.schema === HardkasSchemas.TxPlan || migrated.schema === HardkasSchemas.SignedTx || migrated.schema === HardkasSchemas.TxReceipt)
    ) {
      const legacyModes: Record<string, string> = { simulated: "simulator", simulator: "simulator", localnet: "localnet", node: "localnet", rpc: "rpc", real: "rpc", "l2-rpc": "l2-rpc" };
      const mode = legacyModes[migrated.mode];
      if (mode) migrated.execution = { mode, domain: "kaspa-l1", network: migrated.networkId };
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
// Source verification and sealing without whitewash (IC-4′.7)
// ---------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;

interface VerifiedSource {
  hashVersion: number;
  artifactId: string;
}

/**
 * A migration starts from a VERIFIED source: its hashVersion must be a valid
 * declaration and its body must hash to the identity it claims under that
 * version. Nothing is re-issued from material that does not verify.
 */
export function verifyMigrationSource(source: ArtifactPayload): VerifiedSource {
  const hashVersion = readDeclaredHashVersion(source);
  if (hashVersion === null) {
    throw new MigrationError(
      "HASH_VERSION_INVALID",
      `the source declares hashVersion ${JSON.stringify(source.hashVersion)}; an artifact that cannot be verified cannot be migrated (IC-4′.2)`
    );
  }
  const recomputed = calculateContentHash(source, hashVersion);
  if (typeof source.contentHash !== "string" || source.contentHash.length === 0) {
    throw new MigrationError("MIGRATION_SOURCE_INVALID", "the source carries no contentHash to verify");
  }
  if (source.contentHash !== recomputed) {
    throw new MigrationError(
      "MIGRATION_SOURCE_INVALID",
      `the source claims contentHash ${source.contentHash} but its body hashes to ${recomputed} under hashVersion ${hashVersion}`
    );
  }
  const lineageId = (source.lineage as Record<string, unknown> | undefined)?.artifactId;
  if (typeof lineageId === "string" && lineageId.length > 0 && lineageId !== recomputed) {
    throw new MigrationError(
      "MIGRATION_SOURCE_INVALID",
      `the source's lineage.artifactId ${lineageId} is not its recomputed identity ${recomputed}`
    );
  }
  return { hashVersion, artifactId: recomputed };
}

/** Parses the dotted/indexed paths produced by legacyUnauthenticatedMaterialFields. */
function parsePath(pathStr: string): Array<string | number> {
  const segments: Array<string | number> = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pathStr))) {
    if (m[1] !== undefined) segments.push(m[1]);
    else segments.push(Number(m[2]));
  }
  return segments;
}

function getAtPath(root: unknown, segments: Array<string | number>): unknown {
  let current: any = root;
  for (const seg of segments) {
    if (current === null || typeof current !== "object") return undefined;
    current = current[seg as any];
  }
  return current;
}

function deleteAtPath(root: unknown, segments: Array<string | number>): void {
  if (segments.length === 0) return;
  const parent = getAtPath(root, segments.slice(0, -1));
  if (parent === null || typeof parent !== "object") return;
  delete (parent as any)[segments[segments.length - 1] as any];
}

/**
 * Seals `body` as a NEW version-5 artifact derived from a verified legacy
 * source, without whitewash (IC-4′.7):
 *  - every material field the source version never authenticated is REMOVED
 *    from the body and recorded in `legacyClaims` (an unverified legacy claim);
 *  - a top-level `artifactId` never enters v5 (IC-7.3);
 *  - derived labels are recomputed from the new identity (IC-1′.1c);
 *  - the lineage is rebuilt as a child of the verified source. The source's
 *    lineageId/rootArtifactId are carried only when the source version
 *    authenticated its lineage; otherwise the verified source is the root.
 */
function sealFromVerifiedSource(
  body: ArtifactPayload,
  source: ArtifactPayload,
  verified: VerifiedSource
): { artifact: ArtifactPayload; legacyClaims: LegacyClaims | undefined; stripped: string[] } {
  const current: ArtifactPayload = structuredClone(body);
  const claims: Record<string, unknown> = {};

  const unauthenticated = legacyUnauthenticatedMaterialFields(source, verified.hashVersion)
    // longest paths first so nested removals never race their parents
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
  for (const p of unauthenticated) {
    if (p === "hashVersion") continue; // re-declared below, never a claim
    const segments = parsePath(p);
    const value = getAtPath(current, segments);
    if (value === undefined) continue;
    claims[p] = structuredClone(value);
    deleteAtPath(current, segments);
  }
  if (current.artifactId !== undefined) {
    if (claims.artifactId === undefined) claims.artifactId = current.artifactId;
    delete current.artifactId;
  }
  for (const label of V5_DERIVED_LABELS) delete current[label];
  delete current.contentHash;
  delete current.originalContentHash;

  const sourceLineage = (source.lineage as Record<string, unknown> | undefined) ?? undefined;
  const lineageAuthenticated = verified.hashVersion >= 4 && sourceLineage !== undefined;
  const carried = (field: "lineageId" | "rootArtifactId"): string | undefined => {
    const value = lineageAuthenticated ? sourceLineage?.[field] : undefined;
    return typeof value === "string" && HEX64.test(value) ? value : undefined;
  };
  const rootId = carried("rootArtifactId") ?? verified.artifactId;
  const previousSequence =
    typeof sourceLineage?.sequence === "number" && Number.isFinite(sourceLineage.sequence)
      ? (sourceLineage.sequence as number)
      : 0;
  current.lineage = {
    artifactId: "",
    lineageId: carried("lineageId") ?? rootId,
    parentArtifactId: verified.artifactId,
    rootArtifactId: rootId,
    sequence: previousSequence + 1
  };

  const stripped = Object.keys(claims).sort();
  const legacyClaims: LegacyClaims | undefined =
    stripped.length > 0
      ? {
          sourceHashVersion: verified.hashVersion,
          sourceArtifactId: verified.artifactId,
          verified: false,
          note: LEGACY_CLAIMS_NOTE,
          fields: Object.fromEntries(stripped.map((k) => [k, claims[k]]))
        }
      : undefined;
  if (legacyClaims) current.legacyClaims = legacyClaims;
  else delete current.legacyClaims;

  // One pass under the current version; lineage.artifactId is an exact-path self reference.
  current.hashVersion = CURRENT_HASH_VERSION;
  const hash = calculateContentHash(current, CURRENT_HASH_VERSION);
  current.contentHash = hash;
  (current.lineage as Record<string, unknown>).artifactId = hash;
  if (current.schema === HardkasSchemas.TxPlan) current.planId = `plan-${hash.slice(0, 16)}`;
  if (current.schema === HardkasSchemas.SignedTx) current.signedId = `signed-${hash.slice(0, 16)}`;

  // Post-condition: the re-issued artifact verifies strict, or nothing is issued.
  const check = verifyArtifactIntegritySync(structuredClone(current), { strict: true });
  if (!check.ok) {
    const schemaIssues = check.issues.filter((i) => i.code === "ARTIFACT_SCHEMA_INVALID");
    const missingRequired = schemaIssues
      .map((i) => i.path ?? "")
      .filter((p) => p.length > 0 && stripped.some((s) => s === p || s.startsWith(`${p}.`) || s.startsWith(`${p}[`)));
    if (missingRequired.length > 0 && schemaIssues.length === check.issues.length) {
      throw new MigrationError(
        "MIGRATION_UNVERIFIED_REQUIRED_FIELDS",
        `required field(s) ${[...new Set(missingRequired)].join(", ")} were never authenticated under hashVersion ${verified.hashVersion}; the artifact cannot be re-issued as version ${CURRENT_HASH_VERSION} without asserting unverified claims (IC-4′.7)`,
        { fields: [...new Set(missingRequired)] }
      );
    }
    throw new MigrationError(
      "MIGRATION_RESULT_INVALID",
      `the re-issued artifact does not verify: ${check.issues.map((i) => `${i.code}: ${i.message}`).join("; ")}`,
      { issues: check.issues.map((i) => ({ code: String(i.code), message: i.message })) }
    );
  }

  return { artifact: current, legacyClaims, stripped };
}

// ---------------------------------------------------------------------------
// Core Migration Function
// ---------------------------------------------------------------------------

/**
 * Migrates an artifact payload from its current schema version to the
 * specified target version.
 *
 * **Identity (Closure Pack D-Q1.f / IC-4′.7):**
 * - The source is verified under the version it declares; a source that does
 *   not hash to its claimed identity is refused.
 * - The result is a NEW version-5 artifact whose lineage hangs from the
 *   verified source. Material fields the source never authenticated are moved
 *   to `legacyClaims`, never re-issued as authenticated content.
 *
 * **Non-Destructive:**
 * - The input artifact object is never mutated
 * - The canonical artifact file on disk is never modified
 * - Migration produces a new in-memory representation only
 *
 * @param artifact - The artifact payload to migrate
 * @param targetVersion - The desired target version (defaults to ARTIFACT_VERSION)
 * @returns MigrationResult with the migrated artifact and metadata
 * @throws Error if no migration path exists; MigrationError on a refusal
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

  const verified = verifyMigrationSource(artifact);

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

  const sealed = sealFromVerifiedSource(current, artifact, verified);

  return {
    artifact: sealed.artifact,
    migrated: true,
    originalContentHash: verified.artifactId,
    appliedSteps
  };
}

// ---------------------------------------------------------------------------
// Hash-version migration (D-Q1.f: `artifact migrate --to 5`)
// ---------------------------------------------------------------------------

export interface HashVersionMigrationOptions {
  /** The only supported target is the current hash version. */
  to: number;
  migrationId?: string;
}

export interface HashVersionMigrationResult {
  /** The re-issued version-5 artifact (a NEW identity, child of the source). */
  artifact: ArtifactPayload;
  /** The MigrationReceipt linking source and re-issued artifact. */
  receipt: ArtifactPayload;
  /** The verified source identity and version. */
  source: VerifiedSource;
  /** The legacy-claims block carried by the re-issued artifact, if any field was stripped. */
  legacyClaims: LegacyClaims | undefined;
  /** Paths of the source fields that were NOT re-issued as authenticated content. */
  stripped: string[];
}

/**
 * Re-issues a legacy (hashVersion ≤ 4) artifact as a version-5 artifact plus a
 * MigrationReceipt (Closure Pack D-Q1.f / IC-4′.7). Nothing is rewritten in
 * place; the caller persists the two new artifacts.
 */
export function migrateArtifactToHashVersion(
  source: ArtifactPayload,
  options: HashVersionMigrationOptions
): HashVersionMigrationResult {
  if (options.to !== CURRENT_HASH_VERSION) {
    throw new MigrationError(
      "MIGRATION_TARGET_UNSUPPORTED",
      `only hashVersion ${CURRENT_HASH_VERSION} is a migration target (got ${JSON.stringify(options.to)})`
    );
  }
  const verified = verifyMigrationSource(source);
  if (verified.hashVersion >= CURRENT_HASH_VERSION) {
    throw new MigrationError(
      "MIGRATION_NOT_NEEDED",
      `artifact ${verified.artifactId} already declares hashVersion ${verified.hashVersion}`
    );
  }
  const sealed = sealFromVerifiedSource(source, source, verified);
  const receipt = generateMigrationReceipt(
    source,
    sealed.artifact,
    options.migrationId ?? `migrate-to-${CURRENT_HASH_VERSION}`
  );
  return { artifact: sealed.artifact, receipt, source: verified, legacyClaims: sealed.legacyClaims, stripped: sealed.stripped };
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
 * Both hashes are RECOMPUTED under the versions the artifacts declare (never
 * trusted from a claim); the receipt's lineage is a valid hexadecimal child of
 * the source (N13).
 */
export function generateMigrationReceipt(
  oldArtifact: ArtifactPayload,
  newArtifact: ArtifactPayload,
  migrationId: string
): any {
  const oldVerified = verifyMigrationSource(oldArtifact);
  const newVerified = verifyMigrationSource(newArtifact);
  const oldHash = oldVerified.artifactId;
  const newHash = newVerified.artifactId;

  const oldLineage = (oldArtifact.lineage as Record<string, unknown> | undefined) ?? undefined;
  const lineageAuthenticated = oldVerified.hashVersion >= 4 && oldLineage !== undefined;
  const carried = (field: "lineageId" | "rootArtifactId"): string | undefined => {
    const value = lineageAuthenticated ? oldLineage?.[field] : undefined;
    return typeof value === "string" && HEX64.test(value) ? value : undefined;
  };
  const rootId = carried("rootArtifactId") ?? oldHash;
  const previousSequence =
    typeof oldLineage?.sequence === "number" && Number.isFinite(oldLineage.sequence)
      ? (oldLineage.sequence as number)
      : 0;

  const receipt: any = {
    schema: HardkasSchemas.MigrationReceiptV1,
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
      artifactId: "", // exact-path self reference, filled after the single hash pass
      lineageId: carried("lineageId") ?? rootId,
      parentArtifactId: oldHash,
      rootArtifactId: rootId,
      sequence: previousSequence + 1
    }
  };

  receipt.contentHash = calculateContentHash(receipt, CURRENT_HASH_VERSION);
  receipt.lineage.artifactId = receipt.contentHash;

  // We DO NOT mutate newArtifact to point to the receipt because that would
  // create a circular hash dependency (receipt needs newArtifact hash, newArtifact needs receipt hash).
  // newArtifact's parent is simply oldArtifact.

  return receipt;
}
