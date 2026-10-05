import fs from "node:fs";
import path from "node:path";
import { HardkasSchemas } from "@hardkas/artifacts";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { verifyArtifactIntegrity, listWorkspaceStoreFilesSync, compareStoreCopies } from "@hardkas/artifacts";
import {
  validateEventEnvelope,
  type EventEnvelope,
  type CorruptionIssue,
  formatCorruptionIssue,
  type CorruptionCode,
  EnvironmentTelemetry,
  eventLedgerPath,
  legacyEventLedgerPath
} from "@hardkas/core";
import { computeAuthorityFingerprint, recordProjectionAuthority } from "./projection-status.js";

export interface IndexerOptions {
  cwd?: string;
  strict?: boolean;
}

export interface SyncStats {
  scanned: number;
  indexed: number;
  duplicates: number;
  corrupted: number;
}

export interface SyncResult {
  schema: typeof HardkasSchemas.QueryRebuildV1;
  ok: boolean;
  artifacts: SyncStats;
  events: SyncStats;
  warnings: string[];
  errors: string[];
  issues: CorruptionIssue[];
  generationId?: string;
}

export interface DoctorReport {
  ok: boolean;
  staleArtifacts: number;
  zombieArtifacts: number;
  corruptedFiles: string[];
  orphanEdges: number;
  duplicateProjections: number;
  brokenReplayDependencies: number;
  duplicateEventSequences: number;
  orphanEvents: number;
  lastIndexedAt: string | null;
}

interface IndexerArtifactRow {
  readonly artifact_id: string;
  readonly file_path: string | null;
  readonly file_mtime_ms: number | null;
}

export class HardkasIndexer {
  private db: any;
  private workspaceRoot: string;
  private hardkasDir: string;
  private strict: boolean;

  constructor(db: any, options: IndexerOptions = {}) {
    this.db = db;
    this.workspaceRoot = path.resolve(options.cwd || process.cwd());
    this.hardkasDir = path.join(this.workspaceRoot, ".hardkas");
    this.strict = options.strict || false;
  }

  /**
   * Performs an incremental sync of the index.
   * Transactional.
   */
  public async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      schema: HardkasSchemas.QueryRebuildV1,
      ok: true,
      artifacts: { scanned: 0, indexed: 0, duplicates: 0, corrupted: 0 },
      events: { scanned: 0, indexed: 0, duplicates: 0, corrupted: 0 },
      warnings: [],
      errors: [],
      issues: []
    };

    if (!fs.existsSync(this.hardkasDir)) {
      return result;
    }

    // WORKSPACE-AUTHORITY-1 (WA-I2): the authority this sync derives from, taken BEFORE anything is read, so a change
    // that lands while it runs can only make the projection look stale, never fresh.
    const fingerprint = computeAuthorityFingerprint(this.workspaceRoot);

    // HardKAS Policy: Do not nest transactions.
    // Sync handles its own transaction.
    this.db.exec("BEGIN TRANSACTION;");
    try {
      await this._syncInternal(result);
      recordProjectionAuthority(this.db, fingerprint);
      this.db.exec("COMMIT;");
    } catch (e: unknown) {
      this.db.exec("ROLLBACK;");
      result.ok = false;
      result.errors.push(`Sync failed: ${e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)}`);
      if (this.strict) throw e;
    }

    return result;
  }

  /**
   * Internal indexing logic without transaction management.
   */
  private async _syncInternal(
    result: SyncResult,
    specificPaths?: string[]
  ): Promise<void> {
    // WORKSPACE-AUTHORITY-1 (C1): the projection indexes exactly the artifact store the resolver reads (its root and its
    // canonical subdirectories), never every JSON file under .hardkas/. A targeted sync only takes paths of that set.
    const canonical = listWorkspaceStoreFilesSync(this.workspaceRoot).map((f) => f.path);
    const files = specificPaths ? this.inCanonicalSet(specificPaths, canonical) : canonical;
    await this.syncArtifacts(result, files, !specificPaths);
    this.syncEvents(result);
    this.syncTraces();
    this.cleanupZombies(specificPaths ? undefined : new Set(canonical));

    // Mark last sync
    this.db
      .prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)")
      .run("last_indexed_at", new Date().toISOString()); // hardkas-determinism-allow: last sync ambient metadata

    if (
      result.artifacts.indexed > 0 ||
      result.events.indexed > 0 ||
      result.artifacts.corrupted > 0
    ) {
      const crypto = require("node:crypto");
      const genId = crypto.randomUUID(); // hardkas-determinism-allow: random generation metadata ID
      this.db
        .prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)")
        .run("generation_id", genId);
      result.generationId = genId;
    } else {
      const row = this.db
        .prepare("SELECT value FROM metadata WHERE key = 'generation_id'")
        .get();
      result.generationId = row ? row.value : null;
    }
  }

  /**
   * Performs an incremental sync of only specific paths (Targeted Reindex).
   * Transactional.
   */
  public async syncPaths(paths: string[]): Promise<SyncResult> {
    const result: SyncResult = {
      schema: HardkasSchemas.QueryRebuildV1,
      ok: true,
      artifacts: { scanned: 0, indexed: 0, duplicates: 0, corrupted: 0 },
      events: { scanned: 0, indexed: 0, duplicates: 0, corrupted: 0 },
      warnings: [],
      errors: [],
      issues: []
    };

    if (!fs.existsSync(this.hardkasDir)) {
      return result;
    }

    this.db.exec("BEGIN TRANSACTION;");
    try {
      await this._syncInternal(result, paths);
      this.db.exec("COMMIT;");
    } catch (e: unknown) {
      this.db.exec("ROLLBACK;");
      result.ok = false;
      result.errors.push(`Targeted Sync failed: ${e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)}`);
      if (this.strict) throw e;
    }

    return result;
  }

  /**
   * Complete wipe and rebuild of the index.
   */
  /**
   * Complete wipe and rebuild of the index.
   * Atomic across wipe and first sync.
   */
  public async rebuild(): Promise<SyncResult> {
    const result: SyncResult = {
      schema: HardkasSchemas.QueryRebuildV1,
      ok: true,
      artifacts: { scanned: 0, indexed: 0, duplicates: 0, corrupted: 0 },
      events: { scanned: 0, indexed: 0, duplicates: 0, corrupted: 0 },
      warnings: [],
      errors: [],
      issues: []
    };

    const lockFile = path.join(this.hardkasDir, "query-store-rebuild.lock");
    try {
      if (!fs.existsSync(this.hardkasDir)) fs.mkdirSync(this.hardkasDir, { recursive: true });
      fs.writeFileSync(lockFile, process.pid.toString(), { flag: "wx" });
    } catch (e: any) {
      if (e.code === "EEXIST") {
        const stats = fs.statSync(lockFile, { throwIfNoEntry: false });
        if (stats && Date.now() - stats.mtimeMs > 60000) {
          try { fs.unlinkSync(lockFile); } catch (e) {}
        }
        const err = new Error("QUERY_STORE_REBUILD_IN_PROGRESS: Another rebuild is currently running.");
        (err as any).code = "QUERY_STORE_REBUILD_IN_PROGRESS";
        throw err;
      }
      throw e;
    }

    try {
      // WORKSPACE-AUTHORITY-1 (WA-I2): taken before the store is read (see sync)
      const fingerprint = computeAuthorityFingerprint(this.workspaceRoot);
      this.db.exec("BEGIN TRANSACTION;");
      try {
        this._wipeInternal();
        EnvironmentTelemetry.logAnomaly("REPLAY_RECONCILIATION", "medium", "replay", "Full query rebuild executed");
        if (fs.existsSync(this.hardkasDir)) {
          await this._syncInternal(result);
        }
        recordProjectionAuthority(this.db, fingerprint);
        this.db.exec("COMMIT;");
      } catch (e: unknown) {
        this.db.exec("ROLLBACK;");
        result.ok = false;
        result.errors.push(`Rebuild failed: ${e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)}`);
        if (this.strict) throw e;
      }
    } finally {
      try { fs.unlinkSync(lockFile); } catch (e) {}
    }

    return result;
  }

  private _wipeInternal(): void {
    this.db.exec("DELETE FROM traces;");
    this.db.exec("DELETE FROM events;");
    try {
      this.db.exec("DELETE FROM lineage_closure;");
    } catch {} // v3+ table
    this.db.exec("DELETE FROM lineage_edges;");
    this.db.exec("DELETE FROM artifacts;");
    this.db.exec("DELETE FROM metadata WHERE key IN ('last_indexed_at', 'authority_fingerprint', 'projection_contract');");
    try {
      this.db.exec("DELETE FROM lineage_stats;");
    } catch {} // v3+ table
  }

  /**
   * Diagnostic check of the index integrity and freshness.
   */
  public doctor(): DoctorReport {
    const report: DoctorReport = {
      ok: true,
      staleArtifacts: 0,
      zombieArtifacts: 0,
      corruptedFiles: [],
      orphanEdges: 0,
      duplicateProjections: 0,
      brokenReplayDependencies: 0,
      duplicateEventSequences: 0,
      orphanEvents: 0,
      lastIndexedAt: null
    };

    // 1. Check last indexed
    const lastIdx = this.db
      .prepare("SELECT value FROM metadata WHERE key = 'last_indexed_at'")
      .get() as { value: string } | undefined;
    report.lastIndexedAt = lastIdx?.value || null;

    // 2. Check for zombie rows (rows with no file or mismatched mtime)
    const rows = this.db
      .prepare("SELECT artifact_id, file_path, file_mtime_ms FROM artifacts")
      .all() as IndexerArtifactRow[];
    for (const row of rows) {
      if (!row.file_path || !fs.existsSync(row.file_path)) {
        report.zombieArtifacts++;
      } else {
        const stat = fs.statSync(row.file_path);
        if (stat.mtimeMs !== row.file_mtime_ms) {
          report.staleArtifacts++;
        }
      }
    }

    // 3. Check for orphan edges
    const orphans = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM lineage_edges 
      WHERE parent_artifact_id NOT IN (SELECT artifact_id FROM artifacts)
      OR child_artifact_id NOT IN (SELECT artifact_id FROM artifacts)
    `
      )
      .get() as { count: number };
    report.orphanEdges = orphans.count;

    // 4. Duplicate projections (tx_id should be unique for specific schemas like receipts)
    const duplicateProjections = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM (
        SELECT tx_id FROM artifacts WHERE tx_id IS NOT NULL AND schema LIKE '%txReceipt%' GROUP BY tx_id HAVING COUNT(*) > 1
      )
    `
      )
      .get() as { count: number };
    report.duplicateProjections = duplicateProjections.count;

    // 5. Broken replay dependencies
    const brokenReplayDeps = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM artifacts a
      LEFT JOIN artifacts target ON target.tx_id = json_extract(a.raw_json, '$.payload.txId')
      WHERE a.schema = ?
      AND target.artifact_id IS NULL
    `
      )
      .get(HardkasSchemas.ReplayReportV1) as { count: number };
    report.brokenReplayDependencies = brokenReplayDeps.count;

    // Also check for corrupted artifacts in the database
    const corruptedRows = this.db
      .prepare("SELECT file_path FROM artifacts WHERE kind = 'CORRUPTED'")
      .all() as { file_path: string }[];
    report.corruptedFiles = corruptedRows.map((r) => r.file_path);

    // 6. Event sequence positions shared by DISTINCT events. WORKSPACE-AUTHORITY-1 (A): the index keeps one row per event
    // identity, so these are the ledger's own data (e.g. every standalone SDK `artifact.written` is wf_unknown_standalone/1),
    // reported for producers, never a projection defect: they do not make the projection unhealthy.
    const duplicateSequences = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM (
        SELECT correlation_id, sequence_number, kind FROM events 
        GROUP BY correlation_id, sequence_number, kind HAVING COUNT(*) > 1
      )
    `
      )
      .get() as { count: number };
    report.duplicateEventSequences = duplicateSequences.count;

    // 7. Orphan Events (events causing actions but missing root causation/workflow if required)
    const orphanEvents = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM events e
      WHERE e.causation_id IS NOT NULL AND e.causation_id NOT IN (SELECT event_id FROM events)
    `
      )
      .get() as { count: number };
    report.orphanEvents = orphanEvents.count;

    // Strict ok evaluation
    report.ok =
      report.staleArtifacts === 0 &&
      report.zombieArtifacts === 0 &&
      report.orphanEdges === 0 &&
      report.duplicateProjections === 0 &&
      report.brokenReplayDependencies === 0 &&
      report.orphanEvents === 0 &&
      report.corruptedFiles.length === 0;

    return report;
  }

  /**
   * Whether the indexed row of a file already holds exactly its current content. WORKSPACE-AUTHORITY-1 (WA-I2): an equal
   * mtime alone is not proof (a rewrite within the clock's resolution keeps it), and a projection that claims freshness
   * must hold what the files hold.
   */
  private isIndexedAsIs(filePath: string, currentMtimeMs: number, content: string): boolean {
    try {
      const row = this.db
        .prepare("SELECT file_mtime_ms, raw_json FROM artifacts WHERE file_path = ?")
        .get(filePath) as { file_mtime_ms: number | null; raw_json: string } | undefined;
      return !!row && row.file_mtime_ms === currentMtimeMs && row.raw_json === content;
    } catch {
      return false;
    }
  }

  /** The given paths that belong to the canonical store set (compared by real path), sorted. */
  private inCanonicalSet(paths: string[], canonical: string[]): string[] {
    const set = new Set(canonical);
    const real = (p: string) => {
      try {
        return path.resolve(fs.realpathSync(p));
      } catch {
        return path.resolve(p);
      }
    };
    return [...new Set(paths.map(real).filter((p) => set.has(p)))].sort();
  }

  private async syncArtifacts(result: SyncResult, canonicalFiles: string[], incremental: boolean) {
    // Sort files to ensure deterministic indexing order. WORKSPACE-AUTHORITY-1 (C1): an identity's canonical copy comes
    // first, so it is the one its row keeps (the filesystem backend shows the same copy).
    const files = [...canonicalFiles].sort(compareStoreCopies);

    const indexedAt = new Date().toISOString(); // hardkas-determinism-allow: index time metadata

    const upsertArtifact = this.db.prepare(`
      INSERT INTO artifacts 
      (artifact_id, content_hash, schema, version, kind, mode, network_id, tx_id, created_at, raw_json, file_path, file_mtime_ms, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(artifact_id) DO UPDATE SET
        content_hash = excluded.content_hash,
        schema = excluded.schema,
        version = excluded.version,
        kind = excluded.kind,
        mode = excluded.mode,
        network_id = excluded.network_id,
        tx_id = excluded.tx_id,
        created_at = excluded.created_at,
        raw_json = excluded.raw_json,
        file_path = excluded.file_path,
        file_mtime_ms = excluded.file_mtime_ms,
        indexed_at = excluded.indexed_at
    `);

    const insertEdge = this.db.prepare(`
      INSERT OR REPLACE INTO lineage_edges (lineage_id, parent_artifact_id, child_artifact_id, edge_kind, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const artifactsToLink: Array<{ parsed: any; artifactId: string }> = [];
    let skipped = 0;

    for (const file of files) {
      result.artifacts.scanned++;
      let stat: fs.Stats;
      let currentContent: string;
      try {
        stat = fs.statSync(file);
        currentContent = fs.readFileSync(file, "utf-8");
      } catch {
        continue; // gone since it was listed; the zombie cleanup drops its row
      }

      // Incremental sync optimization: skip files whose row already holds exactly their content
      if (incremental && this.isIndexedAsIs(file, stat.mtimeMs, currentContent)) {
        skipped++;
        continue;
      }

      try {
        const verification = await verifyArtifactIntegrity(file);
        const isCorrupt = !verification.ok;

        if (isCorrupt) {
          result.artifacts.corrupted++;
          verification.issues.forEach((issue: any) => {
            let mappedCode = issue.code;
            if (mappedCode === "HASH_MISMATCH") mappedCode = "ARTIFACT_HASH_MISMATCH";
            if (mappedCode === "MISSING_CONTENT_HASH")
              mappedCode = "ARTIFACT_SCHEMA_INVALID";

            const corruptionIssue: CorruptionIssue = {
              code: mappedCode as CorruptionCode,
              severity: issue.severity === "warning" ? "warning" : "error",
              message: issue.message,
              path: file
            };
            result.issues.push(corruptionIssue);
            result.warnings.push(formatCorruptionIssue(corruptionIssue));
          });

          if (this.strict) {
            EnvironmentTelemetry.logAnomaly(
              "EXTERNAL_MUTATION",
              "critical",
              "query-store",
              `Strict mode: corrupted artifact in ${file}`
            );
            throw new Error(`Strict mode: corrupted artifact in ${file}`);
          }
        }

        const content = currentContent;
        // Wave 1.2 · N2 / IC-5′.9: the index key is the RECOMPUTED artifactId (the
        // verifier's actualHash under the declared version). A file that does not
        // verify is stored as CORRUPTED under a path-derived key, never under the
        // identity it claims (`artifactId`, `contentHash`), so an impostor can never
        // reach a victim's row. A key collision with different content is corruption,
        // never an UPDATE. One file holds one artifact: a rewritten file drops the row
        // it held under its previous identity.
        const pathKey = `corrupt:${path.relative(this.hardkasDir, file).replace(/\\/g, "/")}`;
        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch (err) {
          // completely invalid JSON
          this.db.prepare("DELETE FROM artifacts WHERE file_path = ? AND artifact_id <> ?").run(file, pathKey);
          upsertArtifact.run(
            pathKey,
            "INVALID_JSON",
            "unknown",
            0,
            "CORRUPTED",
            "unknown",
            "unknown",
            null,
            null,
            content,
            file,
            stat.mtimeMs,
            indexedAt
          );
          continue;
        }

        const artifactId = isCorrupt ? pathKey : (verification.actualHash as string);
        const hash = isCorrupt ? "MISMATCH" : (verification.actualHash as string);

        this.db.prepare("DELETE FROM artifacts WHERE file_path = ? AND artifact_id <> ?").run(file, artifactId);
        const existing = this.db
          .prepare("SELECT content_hash, file_path FROM artifacts WHERE artifact_id = ?")
          .get(artifactId) as { content_hash: string; file_path: string | null } | undefined;
        if (existing && existing.file_path !== file) {
          if (existing.content_hash === hash && existing.file_path && fs.existsSync(existing.file_path)) {
            // An identical copy of an artifact already indexed from another file. The row keeps the canonical copy
            // (compareStoreCopies), whichever of the two was indexed first.
            if (compareStoreCopies(file, existing.file_path) < 0) {
              this.db
                .prepare("UPDATE artifacts SET file_path = ?, file_mtime_ms = ?, raw_json = ? WHERE artifact_id = ?")
                .run(file, stat.mtimeMs, content, artifactId);
            }
            result.artifacts.duplicates++;
            continue;
          }
          if (existing.content_hash !== hash) {
            const corruptionIssue: CorruptionIssue = {
              code: "ARTIFACT_ID_COLLISION",
              severity: "error",
              message: `Artifact identity ${artifactId} is already indexed from ${existing.file_path} with different content; ${file} is not indexed`,
              path: file
            };
            result.artifacts.corrupted++;
            result.issues.push(corruptionIssue);
            result.warnings.push(formatCorruptionIssue(corruptionIssue));
            if (this.strict) throw new Error(`Strict mode: artifact identity collision in ${file}`);
            continue;
          }
        }

        upsertArtifact.run(
          artifactId,
          hash,
          parsed.schema || "unknown",
          parsed.version || 0,
          isCorrupt ? "CORRUPTED" : parsed.kind || parsed.schema,
          parsed.mode || "unknown",
          parsed.networkId || "unknown",
          parsed.txId || null,
          parsed.createdAt || null,
          content,
          file,
          stat.mtimeMs,
          indexedAt
        );

        result.artifacts.indexed++;

        if (!isCorrupt && parsed.lineage && parsed.lineage.parentArtifactId) {
          artifactsToLink.push({ parsed, artifactId });
        }
      } catch (e: unknown) {
        result.artifacts.corrupted++;
        const code: CorruptionCode =
          e instanceof SyntaxError ? "ARTIFACT_JSON_INVALID" : "ARTIFACT_ID_INVALID";
        const corruptionIssue: CorruptionIssue = {
          code,
          severity: "error",
          message: e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e),
          path: file
        };
        result.issues.push(corruptionIssue);
        if (this.strict) throw e;
        result.warnings.push(formatCorruptionIssue(corruptionIssue));
      }
    }

    // Pass 2: Lineage Edges (Now all artifact IDs exist). Edges use artifactIds (IC-5′.9).
    for (const { parsed, artifactId } of artifactsToLink) {
      try {
        insertEdge.run(
          parsed.lineage.lineageId || "legacy-lineage",
          parsed.lineage.parentArtifactId,
          artifactId,
          "derived",
          parsed.createdAt || null
        );
      } catch (e: unknown) {
        result.warnings.push(
          `Failed to link lineage for ${artifactId}: ${e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)}`
        );
      }
    }

    // Pass 3: Build lineage closure (transitive ancestor/descendant relationships)
    this.buildLineageClosure();
  }

  /**
   * Builds the transitive closure of the lineage graph.
   * For each edge (parent -> child), we also store (grandparent -> child), etc.
   * This enables O(1) ancestor/descendant queries without recursive CTEs.
   */
  private buildLineageClosure(): void {
    try {
      // Wipe and rebuild closure from edges (idempotent)
      this.db.exec("DELETE FROM lineage_closure;");

      // Direct edges: depth 1
      this.db.exec(`
        INSERT OR IGNORE INTO lineage_closure (ancestor_id, descendant_id, depth, created_at)
        SELECT parent_artifact_id, child_artifact_id, 1, created_at
        FROM lineage_edges;
      `);

      // Transitive closure: iterate until no new rows are added
      let added = 1;
      let currentDepth = 1;
      const maxDepth = 100; // Safety limit

      while (added > 0 && currentDepth < maxDepth) {
        currentDepth++;
        const insertResult = this.db
          .prepare(
            `
          INSERT OR IGNORE INTO lineage_closure (ancestor_id, descendant_id, depth, created_at)
          SELECT c1.ancestor_id, c2.descendant_id, ? , c2.created_at
          FROM lineage_closure c1
          JOIN lineage_closure c2 ON c1.descendant_id = c2.ancestor_id
          WHERE c1.depth = ? - 1
          AND NOT EXISTS (
            SELECT 1 FROM lineage_closure existing
            WHERE existing.ancestor_id = c1.ancestor_id AND existing.descendant_id = c2.descendant_id
          )
        `
          )
          .run(currentDepth, currentDepth);
        added = insertResult.changes;
      }

      // Update lineage stats
      const closureCount = (
        this.db.prepare("SELECT COUNT(*) as count FROM lineage_closure").get() as {
          count: number;
        }
      ).count;
      const edgeCount = (
        this.db.prepare("SELECT COUNT(*) as count FROM lineage_edges").get() as {
          count: number;
        }
      ).count;
      const maxLineageDepth = (
        this.db
          .prepare("SELECT COALESCE(MAX(depth), 0) as maxDepth FROM lineage_closure")
          .get() as { maxDepth: number }
      ).maxDepth;

      const updateStat = this.db.prepare(
        "INSERT OR REPLACE INTO lineage_stats (stat_key, stat_value, updated_at) VALUES (?, ?, ?)"
      );
      const now = new Date().toISOString(); // hardkas-determinism-allow: stats metadata timestamp
      updateStat.run("closure_entries", String(closureCount), now);
      updateStat.run("direct_edges", String(edgeCount), now);
      updateStat.run("max_lineage_depth", String(maxLineageDepth), now);
    } catch (e: unknown) {
      // lineage_closure table might not exist yet (pre-v3 migration)
      // Silently skip - this is non-critical
    }
  }

  private syncEvents(result: SyncResult) {
    // WORKSPACE-AUTHORITY-1 (A): the workspace's one event ledger (`eventLedgerPath`), never a file under .hardkas/. A
    // legacy `.hardkas/events.jsonl` is never merged into it: it is only reported.
    const eventsPath = eventLedgerPath(this.workspaceRoot);
    const legacyPath = legacyEventLedgerPath(this.workspaceRoot);
    if (fs.existsSync(legacyPath)) {
      result.warnings.push(
        `A legacy event ledger exists at ${legacyPath}; it is not this workspace's ledger (${eventsPath}) and was not indexed or merged.`
      );
    }
    if (!fs.existsSync(eventsPath)) return;

    const stat = fs.statSync(eventsPath);
    const indexedAt = new Date().toISOString(); // hardkas-determinism-allow: index time metadata

    const content = fs.readFileSync(eventsPath, "utf-8");
    const lines = content.split("\n");

    // The index mirrors the ledger: one row per event identity (eventId), every event of the ledger and nothing else.
    this.db.exec("CREATE TEMP TABLE IF NOT EXISTS ledger_event_ids (event_id TEXT PRIMARY KEY); DELETE FROM ledger_event_ids;");
    const markSeen = this.db.prepare("INSERT OR IGNORE INTO ledger_event_ids (event_id) VALUES (?)");
    const upsertEvent = this.db.prepare(`
      INSERT INTO events
      (event_id, kind, domain, timestamp, emitted_at, workflow_id, correlation_id, causation_id, tx_id, artifact_id, network_id, sequence_number, global_offset, source_subsystem, raw_json, file_path, file_mtime_ms, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        kind = excluded.kind,
        correlation_id = excluded.correlation_id,
        sequence_number = excluded.sequence_number,
        domain = excluded.domain,
        timestamp = excluded.timestamp,
        emitted_at = excluded.emitted_at,
        workflow_id = excluded.workflow_id,
        causation_id = excluded.causation_id,
        tx_id = excluded.tx_id,
        artifact_id = excluded.artifact_id,
        network_id = excluded.network_id,
        global_offset = excluded.global_offset,
        source_subsystem = excluded.source_subsystem,
        raw_json = excluded.raw_json,
        file_path = excluded.file_path,
        file_mtime_ms = excluded.file_mtime_ms,
        indexed_at = excluded.indexed_at
    `);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === "") continue;

      result.events.scanned++;
      const lineNum = i + 1;

      try {
        const parsed = JSON.parse(line) as EventEnvelope;
        if (!validateEventEnvelope(parsed)) {
          const issue: CorruptionIssue = {
            code: "EVENT_SCHEMA_INVALID",
            severity: "error",
            message: "Invalid event envelope structure",
            path: eventsPath,
            lineNumber: lineNum
          };
          result.issues.push(issue);
          result.events.corrupted++;
          if (this.strict) throw new Error(formatCorruptionIssue(issue));
          result.warnings.push(formatCorruptionIssue(issue));
          continue;
        }

        upsertEvent.run(
          parsed.eventId,
          parsed.kind,
          parsed.domain,
          parsed.timestamp || null,
          parsed.emittedAt || parsed.timestamp || null,
          parsed.workflowId,
          parsed.correlationId,
          parsed.causationId || null,
          parsed.txId || null,
          parsed.artifactId || null,
          parsed.networkId,
          parsed.sequenceNumber ?? 0,
          parsed.globalOffset ?? lineNum,
          parsed.sourceSubsystem || "unknown",
          line,
          eventsPath,
          stat.mtimeMs,
          indexedAt
        );
        // the same event appended twice is one event
        if (markSeen.run(parsed.eventId).changes === 0) result.events.duplicates++;
        else result.events.indexed++;
      } catch (e: unknown) {
        result.events.corrupted++;
        const issue: CorruptionIssue = {
          code: e instanceof SyntaxError ? "EVENT_JSON_INVALID" : "EVENT_LINE_CORRUPT",
          severity: "error",
          message: e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e),
          path: eventsPath,
          lineNumber: lineNum
        };
        result.issues.push(issue);
        if (this.strict) {
          throw new Error(formatCorruptionIssue(issue));
        }
        result.warnings.push(formatCorruptionIssue(issue));
      }
    }

    // an event that is no longer in the ledger (a truncated tail) is no longer in the index
    this.db.exec("DELETE FROM events WHERE event_id NOT IN (SELECT event_id FROM ledger_event_ids);");
  }

  private syncTraces() {
    const upsertTrace = this.db.prepare(`
      INSERT INTO traces (trace_id, workflow_id, root_event_id, status, started_at, ended_at)
      SELECT 
        'trace-' || workflow_id as trace_id,
        workflow_id,
        event_id as root_event_id,
        CASE 
          WHEN kind = 'workflow.completed' THEN 'completed'
          WHEN kind = 'workflow.failed' THEN 'failed'
          ELSE 'running'
        END as status,
        timestamp as started_at,
        CASE 
          WHEN kind IN ('workflow.completed', 'workflow.failed') THEN timestamp
          ELSE NULL
        END as ended_at
      FROM events
      WHERE kind LIKE 'workflow.%'
      ON CONFLICT(workflow_id) DO UPDATE SET
        status = CASE 
          WHEN excluded.status IN ('completed', 'failed') THEN excluded.status
          ELSE traces.status
        END,
        ended_at = CASE 
          WHEN excluded.status IN ('completed', 'failed') THEN excluded.ended_at
          ELSE traces.ended_at
        END,
        root_event_id = COALESCE(traces.root_event_id, excluded.root_event_id),
        started_at = COALESCE(traces.started_at, excluded.started_at)
    `);

    upsertTrace.run();
  }

  /**
   * Drops the rows of files that are gone and, after a full sync, of files outside the canonical store set (the
   * projection holds that set and nothing else). With no ledger, there are no events.
   */
  private cleanupZombies(canonical?: Set<string>) {
    const rows = this.db
      .prepare("SELECT artifact_id, file_path FROM artifacts")
      .all() as { artifact_id: string; file_path: string | null }[];
    const deleteArtifact = this.db.prepare("DELETE FROM artifacts WHERE artifact_id = ?");

    for (const row of rows) {
      const gone = !row.file_path || !fs.existsSync(row.file_path);
      if (gone || (canonical && !canonical.has(row.file_path!))) {
        if (gone) {
          EnvironmentTelemetry.logAnomaly(
            "EXTERNAL_MUTATION",
            "high",
            "query-store",
            `Zombie artifact cleaned up: ${row.artifact_id}`
          );
        }
        deleteArtifact.run(row.artifact_id);
      }
    }

    // Events cleanup (if the workspace's ledger is gone, all events are gone)
    if (!fs.existsSync(eventLedgerPath(this.workspaceRoot))) {
      this.db.exec("DELETE FROM events;");
    }
  }
}
