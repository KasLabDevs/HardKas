import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { calculateContentHash, verifyArtifactIntegrity } from "@hardkas/artifacts";
import {
  validateEventEnvelope,
  type EventEnvelope,
  type CorruptionIssue,
  formatCorruptionIssue,
  type CorruptionCode,
  EnvironmentTelemetry
} from "@hardkas/core";

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
  schema: "hardkas.queryRebuild.v1";
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
  private hardkasDir: string;
  private strict: boolean;

  constructor(db: any, options: IndexerOptions = {}) {
    this.db = db;
    this.hardkasDir = path.join(options.cwd || process.cwd(), ".hardkas");
    this.strict = options.strict || false;
  }

  /**
   * Performs an incremental sync of the index.
   * Transactional.
   */
  public async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      schema: "hardkas.queryRebuild.v1",
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

    // HardKAS Policy: Do not nest transactions.
    // Sync handles its own transaction.
    this.db.exec("BEGIN TRANSACTION;");
    try {
      await this._syncInternal(result);
      this.db.exec("COMMIT;");
    } catch (e: any) {
      this.db.exec("ROLLBACK;");
      result.ok = false;
      result.errors.push(`Sync failed: ${e.message}`);
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
    await this.syncArtifacts(result, specificPaths);
    this.syncEvents(result);
    this.syncTraces();
    this.cleanupZombies();

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
      schema: "hardkas.queryRebuild.v1",
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
    } catch (e: any) {
      this.db.exec("ROLLBACK;");
      result.ok = false;
      result.errors.push(`Targeted Sync failed: ${e.message}`);
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
      schema: "hardkas.queryRebuild.v1",
      ok: true,
      artifacts: { scanned: 0, indexed: 0, duplicates: 0, corrupted: 0 },
      events: { scanned: 0, indexed: 0, duplicates: 0, corrupted: 0 },
      warnings: [],
      errors: [],
      issues: []
    };

    this.db.exec("BEGIN TRANSACTION;");
    try {
      // 1. Wipe
      this._wipeInternal();
      EnvironmentTelemetry.logAnomaly(
        "REPLAY_RECONCILIATION",
        "medium",
        "replay",
        "Full query rebuild executed"
      );

      // 2. Full Sync (using internal logic to avoid nested transaction)
      if (fs.existsSync(this.hardkasDir)) {
        await this._syncInternal(result);
      }

      this.db.exec("COMMIT;");
    } catch (e: any) {
      this.db.exec("ROLLBACK;");
      result.ok = false;
      result.errors.push(`Rebuild failed: ${e.message}`);
      if (this.strict) throw e;
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
    this.db.exec("DELETE FROM metadata WHERE key = 'last_indexed_at';");
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
      WHERE a.schema = 'hardkas.replayReport.v1'
      AND target.artifact_id IS NULL
    `
      )
      .get() as { count: number };
    report.brokenReplayDependencies = brokenReplayDeps.count;

    // Also check for corrupted artifacts in the database
    const corruptedRows = this.db
      .prepare("SELECT file_path FROM artifacts WHERE kind = 'CORRUPTED'")
      .all() as { file_path: string }[];
    report.corruptedFiles = corruptedRows.map((r) => r.file_path);

    // 6. Duplicate Event Sequences (should be prevented by DB constraints, but good to verify)
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
      report.duplicateEventSequences === 0 &&
      report.orphanEvents === 0 &&
      report.corruptedFiles.length === 0;

    return report;
  }

  /**
   * Checks if a file needs re-indexing based on mtime comparison.
   * Returns true if the file has changed since last indexing.
   */
  private needsReindex(filePath: string, currentMtimeMs: number): boolean {
    try {
      const row = this.db
        .prepare("SELECT file_mtime_ms FROM artifacts WHERE file_path = ?")
        .get(filePath) as { file_mtime_ms: number | null } | undefined;

      if (!row || row.file_mtime_ms === null) return true;
      return row.file_mtime_ms !== currentMtimeMs;
    } catch {
      return true;
    }
  }

  private async syncArtifacts(result: SyncResult, specificPaths?: string[]) {
    // Sort files to ensure deterministic indexing order
    const files = specificPaths
      ? specificPaths
          .filter(
            (p) => fs.existsSync(p) && p.endsWith(".json") && !p.endsWith("events.jsonl")
          )
          .sort()
      : this.walk(this.hardkasDir).sort();

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

    const artifactsToLink: any[] = [];
    let skipped = 0;

    for (const file of files) {
      result.artifacts.scanned++;
      const stat = fs.statSync(file);

      // Incremental sync optimization: skip unchanged files
      if (!specificPaths && !this.needsReindex(file, stat.mtimeMs)) {
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

        const content = fs.readFileSync(file, "utf-8");
        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch (err) {
          // completely invalid JSON
          const artifactId = path.basename(file, ".json");
          upsertArtifact.run(
            artifactId,
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

        // Artifact ID is required for indexing
        const artifactId =
          parsed.artifactId || parsed.contentHash || calculateContentHash(parsed);
        const hash = isCorrupt
          ? "MISMATCH"
          : parsed.contentHash || calculateContentHash(parsed);

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
          artifactsToLink.push(parsed);
        }
      } catch (e: any) {
        result.artifacts.corrupted++;
        const code: CorruptionCode =
          e instanceof SyntaxError ? "ARTIFACT_JSON_INVALID" : "ARTIFACT_ID_INVALID";
        const corruptionIssue: CorruptionIssue = {
          code,
          severity: "error",
          message: e.message,
          path: file
        };
        result.issues.push(corruptionIssue);
        if (this.strict) throw e;
        result.warnings.push(formatCorruptionIssue(corruptionIssue));
      }
    }

    // Pass 2: Lineage Edges (Now all artifact IDs exist)
    for (const parsed of artifactsToLink) {
      try {
        insertEdge.run(
          parsed.lineage.lineageId || "legacy-lineage",
          parsed.lineage.parentArtifactId,
          parsed.artifactId || parsed.contentHash,
          "derived",
          parsed.createdAt || null
        );
      } catch (e: any) {
        result.warnings.push(
          `Failed to link lineage for ${parsed.artifactId}: ${e.message}`
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
    } catch (e: any) {
      // lineage_closure table might not exist yet (pre-v3 migration)
      // Silently skip - this is non-critical
    }
  }

  private syncEvents(result: SyncResult) {
    const eventsPath = path.join(this.hardkasDir, "events.jsonl");
    if (!fs.existsSync(eventsPath)) return;

    const stat = fs.statSync(eventsPath);
    const indexedAt = new Date().toISOString(); // hardkas-determinism-allow: index time metadata

    const content = fs.readFileSync(eventsPath, "utf-8");
    const lines = content.split("\n");

    const upsertEvent = this.db.prepare(`
      INSERT INTO events 
      (event_id, kind, domain, timestamp, emitted_at, workflow_id, correlation_id, causation_id, tx_id, artifact_id, network_id, sequence_number, global_offset, source_subsystem, raw_json, file_path, file_mtime_ms, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(correlation_id, sequence_number, kind) DO UPDATE SET
        event_id = excluded.event_id,
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
        result.events.indexed++;
      } catch (e: any) {
        result.events.corrupted++;
        const issue: CorruptionIssue = {
          code: e instanceof SyntaxError ? "EVENT_JSON_INVALID" : "EVENT_LINE_CORRUPT",
          severity: "error",
          message: e.message,
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

  private cleanupZombies() {
    const rows = this.db
      .prepare("SELECT artifact_id, file_path FROM artifacts")
      .all() as { artifact_id: string; file_path: string | null }[];
    const deleteArtifact = this.db.prepare("DELETE FROM artifacts WHERE artifact_id = ?");

    for (const row of rows) {
      if (!row.file_path || !fs.existsSync(row.file_path)) {
        EnvironmentTelemetry.logAnomaly(
          "EXTERNAL_MUTATION",
          "high",
          "query-store",
          `Zombie artifact cleaned up: ${row.artifact_id}`
        );
        deleteArtifact.run(row.artifact_id);
      }
    }

    // Events cleanup (if file gone, all events gone)
    const eventsPath = path.join(this.hardkasDir, "events.jsonl");
    if (!fs.existsSync(eventsPath)) {
      this.db.exec("DELETE FROM events;");
    }
  }

  private walk(dir: string, visited: Set<string> = new Set()): string[] {
    let results: string[] = [];
    let realDir: string;
    try {
      realDir = fs.realpathSync(dir);
    } catch {
      return results;
    }

    if (visited.has(realDir)) return results;
    visited.add(realDir);

    let realHardkasDir: string;
    try {
      realHardkasDir = fs.realpathSync(this.hardkasDir);
    } catch {
      return results;
    }

    const isInside = (child: string, parent: string) => {
      // Handle windows casing
      const c = child.toLowerCase();
      const p = parent.toLowerCase();
      if (c === p) return true;
      const parentWithSep = p.endsWith(path.sep) ? p : p + path.sep;
      const result = c.startsWith(parentWithSep);
      return result;
    };

    if (!isInside(realDir, realHardkasDir)) {
      return results;
    }

    let list: string[];
    try {
      list = fs.readdirSync(dir);
    } catch {
      return results;
    }

    for (const file of list) {
      const filePath = path.join(dir, file);
      let stat;
      try {
        stat = fs.lstatSync(filePath);
      } catch {
        continue;
      }

      let isDir = stat.isDirectory();
      if (stat.isSymbolicLink()) {
        try {
          const real = fs.realpathSync(filePath);
          if (!isInside(real, realHardkasDir)) {
            continue;
          }
          isDir = fs.statSync(real).isDirectory();
        } catch {
          continue;
        }
      }

      if (isDir) {
        if (
          file === "node_modules" ||
          file === ".git" ||
          file === "keystore" ||
          file === "snapshots"
        )
          continue;
        results = results.concat(this.walk(filePath, visited));
      } else if (
        file.endsWith(".json") &&
        !file.endsWith("events.jsonl") &&
        file !== "state.json" &&
        !file.endsWith("localnet.json") &&
        !file.endsWith("localnet-state.json") &&
        !file.endsWith("localnet-indexer.json") &&
        !file.endsWith("accounts.real.json") &&
        !file.endsWith("sessions.json")
      ) {
        results.push(filePath);
      }
    }
    return results;
  }
}
