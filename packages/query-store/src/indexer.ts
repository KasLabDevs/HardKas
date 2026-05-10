import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { calculateContentHash } from "@hardkas/artifacts";
import { validateEventEnvelope, type EventEnvelope } from "@hardkas/core";

export interface IndexerOptions {
  cwd?: string;
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
  private db: DatabaseSync;
  private hardkasDir: string;

  constructor(db: DatabaseSync, options: IndexerOptions = {}) {
    this.db = db;
    this.hardkasDir = path.join(options.cwd || process.cwd(), ".hardkas");
  }

  public sync() {
    if (!fs.existsSync(this.hardkasDir)) return;

    this.db.exec("BEGIN TRANSACTION;");
    try {
      this.syncArtifacts();
      this.syncEvents();
      this.syncTraces();
      this.cleanupZombies();
      
      // Mark last sync
      this.db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)")
        .run("last_indexed_at", new Date().toISOString());
        
      this.db.exec("COMMIT;");
    } catch (e) {
      this.db.exec("ROLLBACK;");
      throw e;
    }
  }

  /**
   * Complete wipe and rebuild of the index.
   */
  public rebuild() {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      this.db.exec("DELETE FROM artifacts;");
      this.db.exec("DELETE FROM lineage_edges;");
      this.db.exec("DELETE FROM events;");
      this.db.exec("DELETE FROM traces;");
      this.db.exec("DELETE FROM metadata WHERE key = 'last_indexed_at';");
      this.db.exec("COMMIT;");
      this.sync();
    } catch (e) {
      this.db.exec("ROLLBACK;");
      throw e;
    }
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

  private syncArtifacts() {
    const files = this.walk(this.hardkasDir);
    const indexedAt = new Date().toISOString();

    const upsertArtifact = this.db.prepare(`
      INSERT INTO artifacts 
      (artifact_id, content_hash, schema, version, kind, network_id, tx_id, created_at, raw_json, file_path, file_mtime_ms, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(artifact_id) DO UPDATE SET
        content_hash = excluded.content_hash,
        schema = excluded.schema,
        version = excluded.version,
        kind = excluded.kind,
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

    const mtimeStmt = this.db.prepare("SELECT file_mtime_ms FROM artifacts WHERE artifact_id = ?");

    const artifactsToLink: any[] = [];

    for (const file of files) {
      const stat = fs.statSync(file);
      const existing = this.db.prepare("SELECT artifact_id, file_mtime_ms FROM artifacts WHERE file_path = ?").get(file) as any;
      
      if (existing && existing.file_mtime_ms === stat.mtimeMs) {
        // Still need to track for lineage if we want to be safe, or assume it's already there
        // For simplicity in sync, we'll re-parse lineage for all files or use a more complex cache
      }

      const content = fs.readFileSync(file, "utf-8");
      try {
        const parsed = JSON.parse(content);
        if (!parsed.schema || !parsed.version || !parsed.artifactId) continue;

        const hash = parsed.contentHash || calculateContentHash(parsed);

        upsertArtifact.run(
          parsed.artifactId,
          hash,
          parsed.schema,
          parsed.version,
          parsed.kind || parsed.schema,
          parsed.networkId || "unknown",
          parsed.txId || null,
          parsed.createdAt || null,
          content,
          file,
          stat.mtimeMs,
          indexedAt
        );

        if (parsed.lineage && parsed.lineage.parentArtifactId) {
          artifactsToLink.push(parsed);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }

    // Pass 2: Lineage Edges (Now all artifact IDs exist)
    for (const parsed of artifactsToLink) {
      insertEdge.run(
        parsed.lineage.lineageId || "legacy-lineage",
        parsed.lineage.parentArtifactId,
        parsed.artifactId,
        "derived",
        parsed.createdAt || null
      );
    }
  }

  private syncEvents() {
    const eventsPath = path.join(this.hardkasDir, "events.jsonl");
    if (!fs.existsSync(eventsPath)) return;

    const stat = fs.statSync(eventsPath);
    const indexedAt = new Date().toISOString();

    // Check if events file changed
    const existing = this.db.prepare("SELECT file_mtime_ms FROM events WHERE file_path = ? LIMIT 1").get(eventsPath) as any;
    if (existing && existing.file_mtime_ms === stat.mtimeMs) {
      return;
    }

    const content = fs.readFileSync(eventsPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim() !== "");

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

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as EventEnvelope;
        if (!validateEventEnvelope(parsed)) continue;

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
      } catch (e) {
        // Skip invalid line
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
