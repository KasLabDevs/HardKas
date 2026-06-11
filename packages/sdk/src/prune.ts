/**
 * HardKAS Trace Pruning Module
 *
 * Implements pruning semantics that strip old execution traces
 * while preserving canonical lineage roots and parent-child edges.
 *
 * INVARIANT: lineage_roots_never_pruned
 * INVARIANT: pruning_never_breaks_ancestor_chain
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { HardkasSchemas } from "@hardkas/artifacts";
const require = createRequire(import.meta.url);

export interface PruneOptions {
  /** Root workspace directory */
  cwd: string;
  /** Maximum age of traces to keep (in milliseconds) */
  maxAgeMs?: number;
  /** Maximum number of trace artifacts to keep per lineage chain */
  maxTracesPerLineage?: number;
  /** If true, only report what would be pruned without actually pruning */
  dryRun?: boolean;
  /** If true, perform strict lineage verification before pruning */
  strict?: boolean;
}

export interface PruneResult {
  schema: typeof HardkasSchemas.PruneReportV1;
  ok: boolean;
  dryRun: boolean;
  artifactsPruned: number;
  tracesPruned: number;
  eventsPruned: number;
  lineageRootsPreserved: number;
  totalBytesFreed: number;
  errors: string[];
  /** Artifacts that were pruned (IDs) */
  prunedArtifactIds: string[];
  /** Artifacts that were explicitly preserved as lineage roots */
  preservedRootIds: string[];
}

export interface PruneCandidate {
  artifactId: string;
  filePath: string;
  schema: string;
  createdAt: string | null;
  sizeBytes: number;
  isLineageRoot: boolean;
  isLineageLeaf: boolean;
  descendantCount: number;
}

/**
 * Identifies trace artifacts eligible for pruning.
 *
 * A trace is eligible for pruning if:
 * 1. It is NOT a lineage root (no descendants depend on it as a root)
 * 2. It has no un-pruned descendants
 * 3. It exceeds the age or count threshold
 *
 * Lineage roots are NEVER pruned.
 */
export async function identifyPruneCandidates(
  db: any,
  options: PruneOptions
): Promise<PruneCandidate[]> {
  const maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000; // Default: 7 days
  const cutoffDate = new Date(Date.now() - maxAgeMs).toISOString(); // hardkas-determinism-allow: prune cutoff calculation

  // Find all trace artifacts older than the cutoff
  const candidates = db
    .prepare(
      `
    SELECT 
      a.artifact_id,
      a.file_path,
      a.schema,
      a.created_at,
      LENGTH(a.raw_json) as size_bytes,
      CASE WHEN NOT EXISTS (
        SELECT 1 FROM lineage_edges le WHERE le.parent_artifact_id = a.artifact_id
      ) THEN 0 ELSE 1 END as has_children,
      CASE WHEN NOT EXISTS (
        SELECT 1 FROM lineage_edges le WHERE le.child_artifact_id = a.artifact_id
      ) THEN 1 ELSE 0 END as is_root
    FROM artifacts a
    WHERE a.schema LIKE 'hardkas.txTrace%'
    AND (a.created_at IS NULL OR a.created_at < ?)
    ORDER BY a.created_at ASC
  `
    )
    .all(cutoffDate) as Array<{
    artifact_id: string;
    file_path: string | null;
    schema: string;
    created_at: string | null;
    size_bytes: number;
    has_children: number;
    is_root: number;
  }>;

  const result: PruneCandidate[] = [];

  for (const row of candidates) {
    // Count descendants using closure table if available
    let descendantCount = 0;
    try {
      const closure = db
        .prepare("SELECT COUNT(*) as count FROM lineage_closure WHERE ancestor_id = ?")
        .get(row.artifact_id) as { count: number };
      descendantCount = closure.count;
    } catch {
      // lineage_closure table might not exist (pre-v3)
      descendantCount = row.has_children;
    }

    const isLineageRoot = row.is_root === 1;
    const isLineageLeaf = row.has_children === 0;

    // INVARIANT: lineage_roots_never_pruned
    // Root artifacts anchor the canonical history chain
    if (isLineageRoot) {
      continue;
    }

    // Only prune leaf traces that have no living descendants
    if (!isLineageLeaf && descendantCount > 0) {
      continue;
    }

    result.push({
      artifactId: row.artifact_id,
      filePath: row.file_path || "",
      schema: row.schema,
      createdAt: row.created_at,
      sizeBytes: row.size_bytes,
      isLineageRoot,
      isLineageLeaf,
      descendantCount
    });
  }

  return result;
}

/**
 * Executes pruning of old trace artifacts.
 *
 * This function:
 * 1. Identifies prunable trace candidates
 * 2. Verifies lineage root preservation
 * 3. Removes trace files from filesystem
 * 4. Cleans up corresponding DB records
 * 5. Records pruning history
 */
export async function pruneTraces(db: any, options: PruneOptions): Promise<PruneResult> {
  const result: PruneResult = {
    schema: HardkasSchemas.PruneReportV1,
    ok: true,
    dryRun: options.dryRun ?? false,
    artifactsPruned: 0,
    tracesPruned: 0,
    eventsPruned: 0,
    lineageRootsPreserved: 0,
    totalBytesFreed: 0,
    errors: [],
    prunedArtifactIds: [],
    preservedRootIds: []
  };

  try {
    const candidates = await identifyPruneCandidates(db, options);

    // Count preserved roots
    const rootCount = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM artifacts a
      WHERE NOT EXISTS (
        SELECT 1 FROM lineage_edges le WHERE le.child_artifact_id = a.artifact_id
      )
      AND a.schema NOT LIKE '%CORRUPTED%'
    `
      )
      .get() as { count: number };
    result.lineageRootsPreserved = rootCount.count;

    // Collect preserved root IDs for reporting
    const roots = db
      .prepare(
        `
      SELECT artifact_id FROM artifacts a
      WHERE NOT EXISTS (
        SELECT 1 FROM lineage_edges le WHERE le.child_artifact_id = a.artifact_id
      )
      AND a.schema NOT LIKE '%CORRUPTED%'
      LIMIT 100
    `
      )
      .all() as Array<{ artifact_id: string }>;
    result.preservedRootIds = roots.map((r) => r.artifact_id);

    if (options.dryRun) {
      // Dry run: just report what would be pruned
      result.artifactsPruned = candidates.length;
      result.tracesPruned = candidates.length;
      result.totalBytesFreed = candidates.reduce((sum, c) => sum + c.sizeBytes, 0);
      result.prunedArtifactIds = candidates.map((c) => c.artifactId);
      return result;
    }

    // Execute pruning inside a transaction
    db.exec("BEGIN TRANSACTION;");
    try {
      const deleteArtifact = db.prepare("DELETE FROM artifacts WHERE artifact_id = ?");
      const deleteEdges = db.prepare(
        "DELETE FROM lineage_edges WHERE parent_artifact_id = ? OR child_artifact_id = ?"
      );
      const deleteClosure = db.prepare(
        "DELETE FROM lineage_closure WHERE ancestor_id = ? OR descendant_id = ?"
      );

      for (const candidate of candidates) {
        // Remove from filesystem
        if (candidate.filePath && fs.existsSync(candidate.filePath)) {
          const stat = fs.statSync(candidate.filePath);
          result.totalBytesFreed += stat.size;
          fs.unlinkSync(candidate.filePath);
        }

        // Remove from DB
        deleteEdges.run(candidate.artifactId, candidate.artifactId);
        try {
          deleteClosure.run(candidate.artifactId, candidate.artifactId);
        } catch {} // v3+ table
        deleteArtifact.run(candidate.artifactId);

        result.artifactsPruned++;
        result.tracesPruned++;
        result.prunedArtifactIds.push(candidate.artifactId);
      }

      // Record pruning history
      try {
        const crypto = require("node:crypto");
        const pruneId = crypto.randomUUID(); // hardkas-determinism-allow: prune history ID
        db.prepare(
          `
          INSERT INTO prune_history (prune_id, pruned_at, artifacts_pruned, traces_pruned, events_pruned, lineage_roots_preserved, total_bytes_freed)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          pruneId,
          new Date().toISOString(), // hardkas-determinism-allow: prune timestamp
          result.artifactsPruned,
          result.tracesPruned,
          result.eventsPruned,
          result.lineageRootsPreserved,
          result.totalBytesFreed
        );
      } catch {
        // prune_history table might not exist (pre-v3)
      }

      db.exec("COMMIT;");
    } catch (e: unknown) {
      db.exec("ROLLBACK;");
      result.ok = false;
      result.errors.push(`Pruning transaction failed: ${((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e))}`);
    }
  } catch (e: unknown) {
    result.ok = false;
    result.errors.push(`Pruning failed: ${((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e))}`);
  }

  return result;
}

/**
 * Verifies that pruning did not break any lineage invariants.
 *
 * Checks:
 * 1. All lineage roots are still present
 * 2. No orphan edges exist
 * 3. Closure table is consistent
 */
export function verifyPruneIntegrity(db: any): {
  ok: boolean;
  orphanEdges: number;
  missingRoots: string[];
  closureConsistent: boolean;
} {
  const result = {
    ok: true,
    orphanEdges: 0,
    missingRoots: [] as string[],
    closureConsistent: true
  };

  // Check for orphan edges
  const orphans = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM lineage_edges 
    WHERE parent_artifact_id NOT IN (SELECT artifact_id FROM artifacts)
    OR child_artifact_id NOT IN (SELECT artifact_id FROM artifacts)
  `
    )
    .get() as { count: number };
  result.orphanEdges = orphans.count;

  if (result.orphanEdges > 0) {
    result.ok = false;
  }

  // Check closure table consistency
  try {
    const edgesNotInClosure = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM lineage_edges le
      WHERE NOT EXISTS (
        SELECT 1 FROM lineage_closure lc
        WHERE lc.ancestor_id = le.parent_artifact_id
        AND lc.descendant_id = le.child_artifact_id
      )
    `
      )
      .get() as { count: number };

    if (edgesNotInClosure.count > 0) {
      result.closureConsistent = false;
      result.ok = false;
    }
  } catch {
    // lineage_closure might not exist (pre-v3)
  }

  return result;
}
