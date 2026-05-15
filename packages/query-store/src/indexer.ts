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
  formatCorruptionIssue 
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
}

export interface DoctorReport {
  ok: boolean;
  staleArtifacts: number;
  zombieArtifacts: number;
  corruptedFiles: string[];
  orphanEdges: number;
  lastIndexedAt: string | null;
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
  private async _syncInternal(result: SyncResult): Promise<void> {
    await this.syncArtifacts(result);
    this.syncEvents(result);
    this.syncTraces();
    this.cleanupZombies();
    
    // Mark last sync
    this.db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)")
      .run("last_indexed_at", new Date().toISOString());
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
    this.db.exec("DELETE FROM lineage_edges;");
    this.db.exec("DELETE FROM artifacts;");
    this.db.exec("DELETE FROM metadata WHERE key = 'last_indexed_at';");
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
      lastIndexedAt: null
    };

    // 1. Check last indexed
    const lastIdx = this.db.prepare("SELECT value FROM metadata WHERE key = 'last_indexed_at'").get() as { value: string } | undefined;
    report.lastIndexedAt = lastIdx?.value || null;

    // 2. Check for zombie rows (rows with no file or mismatched mtime)
    const rows = this.db.prepare("SELECT artifact_id, file_path, file_mtime_ms FROM artifacts").all() as any[];
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
    const orphans = this.db.prepare(`
      SELECT COUNT(*) as count FROM lineage_edges 
      WHERE parent_artifact_id NOT IN (SELECT artifact_id FROM artifacts)
      OR child_artifact_id NOT IN (SELECT artifact_id FROM artifacts)
    `).get() as { count: number };
    report.orphanEdges = orphans.count;

    report.ok = report.staleArtifacts === 0 && report.zombieArtifacts === 0 && report.orphanEdges === 0;
    return report;
  }

  private async syncArtifacts(result: SyncResult) {
    // Sort files to ensure deterministic indexing order
    const files = this.walk(this.hardkasDir).sort();
    const indexedAt = new Date().toISOString();

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

    for (const file of files) {
      result.artifacts.scanned++;
      const stat = fs.statSync(file);
      
      try {
        const verification = await verifyArtifactIntegrity(file);
        if (!verification.ok) {
          result.artifacts.corrupted++;
          verification.issues.forEach(issue => {
            const corruptionIssue: CorruptionIssue = {
              code: issue.code as any,
              severity: issue.severity === "warning" ? "warning" : "error",
              message: issue.message,
              path: file
            };
            result.issues.push(corruptionIssue);
            result.warnings.push(formatCorruptionIssue(corruptionIssue));
          });
          
          if (this.strict) {
            throw new Error(`Strict mode: corrupted artifact in ${file}`);
          }
          continue; // Skip corrupted artifact
        }

        const content = fs.readFileSync(file, "utf-8");
        const parsed = JSON.parse(content);
        
        // Artifact ID is required for indexing
        const artifactId = parsed.artifactId || parsed.contentHash || calculateContentHash(parsed);
        const hash = parsed.contentHash || calculateContentHash(parsed);

        upsertArtifact.run(
          artifactId,
          hash,
          parsed.schema,
          parsed.version,
          parsed.kind || parsed.schema,
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

        if (parsed.lineage && parsed.lineage.parentArtifactId) {
          artifactsToLink.push(parsed);
        }
      } catch (e: any) {
        result.artifacts.corrupted++;
        const code = e instanceof SyntaxError ? "ARTIFACT_JSON_INVALID" : "ARTIFACT_ID_INVALID";
        const corruptionIssue: CorruptionIssue = {
          code: code as any,
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
        result.warnings.push(`Failed to link lineage for ${parsed.artifactId}: ${e.message}`);
      }
    }
  }

  private syncEvents(result: SyncResult) {
    const eventsPath = path.join(this.hardkasDir, "events.jsonl");
    if (!fs.existsSync(eventsPath)) return;

    const stat = fs.statSync(eventsPath);
    const indexedAt = new Date().toISOString();

    const content = fs.readFileSync(eventsPath, "utf-8");
    const lines = content.split("\n");

    const upsertEvent = this.db.prepare(`
      INSERT INTO events 
      (event_id, kind, domain, timestamp, workflow_id, correlation_id, causation_id, tx_id, artifact_id, network_id, raw_json, file_path, file_mtime_ms, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        kind = excluded.kind,
        domain = excluded.domain,
        timestamp = excluded.timestamp,
        workflow_id = excluded.workflow_id,
        correlation_id = excluded.correlation_id,
        causation_id = excluded.causation_id,
        tx_id = excluded.tx_id,
        artifact_id = excluded.artifact_id,
        network_id = excluded.network_id,
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
          parsed.workflowId,
          parsed.correlationId,
          parsed.causationId || null,
          parsed.txId || null,
          parsed.artifactId || null,
          parsed.networkId,
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
    const rows = this.db.prepare("SELECT artifact_id, file_path FROM artifacts").all() as any[];
    const deleteArtifact = this.db.prepare("DELETE FROM artifacts WHERE artifact_id = ?");

    for (const row of rows) {
      if (!row.file_path || !fs.existsSync(row.file_path)) {
        deleteArtifact.run(row.artifact_id);
      }
    }

    // Events cleanup (if file gone, all events gone)
    const eventsPath = path.join(this.hardkasDir, "events.jsonl");
    if (!fs.existsSync(eventsPath)) {
      this.db.exec("DELETE FROM events;");
    }
  }

  private walk(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        if (file === "node_modules" || file === ".git") continue;
        results = results.concat(this.walk(filePath));
      } else if (file.endsWith(".json") && !file.endsWith("events.jsonl") && file !== "state.json") {
        results.push(filePath);
      }
    }
    return results;
  }
}
