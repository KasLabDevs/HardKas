import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { calculateContentHash } from "@hardkas/artifacts";
import { validateEventEnvelope, type EventEnvelope } from "@hardkas/core";

export interface IndexerOptions {
  cwd?: string;
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
      this.db.exec("COMMIT;");
    } catch (e) {
      this.db.exec("ROLLBACK;");
      throw e;
    }
  }

  private syncArtifacts() {
    const walk = (dir: string): string[] => {
      let results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          results = results.concat(walk(filePath));
        } else if (file.endsWith(".json") && !file.endsWith("events.jsonl") && file !== "state.json") {
          results.push(filePath);
        }
      }
      return results;
    };

    const files = walk(this.hardkasDir);

    const insertArtifact = this.db.prepare(`
      INSERT OR IGNORE INTO artifacts 
      (artifact_id, content_hash, schema, version, kind, network_id, tx_id, created_at, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEdge = this.db.prepare(`
      INSERT OR IGNORE INTO lineage_edges (lineage_id, parent_artifact_id, child_artifact_id, edge_kind, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const artifactsWithLineage: any[] = [];

    // Pass 1: Index Artifacts
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      try {
        const parsed = JSON.parse(content);
        if (!parsed.schema || !parsed.version || !parsed.artifactId) continue;

        const hash = parsed.contentHash || calculateContentHash(parsed);

        insertArtifact.run(
          parsed.artifactId,
          hash,
          parsed.schema,
          parsed.version,
          parsed.kind || parsed.schema,
          parsed.networkId || "unknown",
          parsed.txId || null,
          parsed.createdAt || null,
          content
        );

        if (parsed.lineage && parsed.lineage.parentArtifactId) {
          artifactsWithLineage.push(parsed);
        }

      } catch (e) {
        // Skip invalid JSON
      }
    }

    // Pass 2: Index Lineage Edges (after artifacts are present)
    for (const parsed of artifactsWithLineage) {
      try {
        insertEdge.run(
          parsed.lineage.lineageId || "legacy-lineage",
          parsed.lineage.parentArtifactId,
          parsed.artifactId,
          "derived",
          parsed.createdAt || null
        );
      } catch (e) {
        // Ignore edge errors (e.g. FK violation if parent missing from disk)
      }
    }
  }

  private syncEvents() {
    const eventsPath = path.join(this.hardkasDir, "events.jsonl");
    if (!fs.existsSync(eventsPath)) return;

    const content = fs.readFileSync(eventsPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim() !== "");

    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM events");
    const result = stmt.get() as { count: number };
    const existingCount = result.count;

    if (lines.length <= existingCount) return;

    const newLines = lines.slice(existingCount);

    const insertEvent = this.db.prepare(`
      INSERT OR IGNORE INTO events 
      (event_id, kind, domain, timestamp, workflow_id, correlation_id, causation_id, tx_id, artifact_id, network_id, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const line of newLines) {
      try {
        const parsed = JSON.parse(line) as EventEnvelope;
        if (!validateEventEnvelope(parsed)) continue;

        insertEvent.run(
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
          line
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
}
