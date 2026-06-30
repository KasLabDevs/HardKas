import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { HardkasError } from "@hardkas/core";

export interface Migration {
  version: number;
  name: string;
  checksum: string;
  up(db: any): void;
}

export interface MigrationHistoryEntry {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
}

export class MigrationRunner {
  constructor(private db: any) {}

  /**
   * Ensures the migration history table exists.
   */
  public ensureHistoryTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hardkas_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Fetches all applied migrations from the history table.
   */
  public getAppliedMigrations(): MigrationHistoryEntry[] {
    try {
      const stmt = this.db.prepare(
        "SELECT * FROM hardkas_migrations ORDER BY version ASC"
      );
      return stmt.all() as MigrationHistoryEntry[];
    } catch {
      return [];
    }
  }

  /**
   * Applies pending migrations in order.
   */
  public migrate(migrations: Migration[]): {
    applied: number;
    status: "ok" | "bootstrapped" | "failed";
  } {
    this.ensureHistoryTable();

    const applied = this.getAppliedMigrations();
    const appliedMap = new Map(applied.map((m) => [m.version, m]));

    // Check for checksum mismatches in already applied migrations
    for (const m of migrations) {
      const existing = appliedMap.get(m.version);
      if (existing && existing.checksum !== m.checksum) {
        throw new HardkasError(
          "STORE_MIGRATION_CHECKSUM_MISMATCH",
          `Migration checksum mismatch for version ${m.version} (${m.name}). Expected ${m.checksum}, got ${existing.checksum}.`
        );
      }
    }

    const pending = migrations
      .filter((m) => !appliedMap.has(m.version))
      .sort((a, b) => a.version - b.version);

    if (pending.length === 0) {
      return { applied: 0, status: "ok" };
    }

    let appliedCount = 0;
    for (const m of pending) {
      try {
        this.db.exec("BEGIN TRANSACTION;");

        m.up(this.db);

        const stmt = this.db.prepare(
          "INSERT INTO hardkas_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)"
        );
        stmt.run(m.version, m.name, m.checksum, new Date().toISOString()); // hardkas-determinism-allow: migrations applied_at metadata

        this.db.exec("COMMIT;");
        appliedCount++;
      } catch (e) {
        this.db.exec("ROLLBACK;");
        throw new HardkasError(
          "STORE_MIGRATION_FAILED",
          `Failed to apply migration ${m.version} (${m.name}): ${e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)}`,
          { cause: e }
        );
      }
    }

    return { applied: appliedCount, status: "ok" };
  }

  /**
   * Legacy bootstrap: if the DB is in a known state but has no migration history,
   * we inject the history without running the 'up' logic.
   */
  public bootstrapLegacy(knownVersion: number, migrations: Migration[]): boolean {
    const applied = this.getAppliedMigrations();
    if (applied.length > 0) return false; // Already has history

    // Check if it's a known legacy state (e.g. has artifacts table)
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'")
      .get();
    if (!tables) return false;

    // It's a legacy DB. Inject history for migrations up to knownVersion.
    this.ensureHistoryTable();
    for (const m of migrations) {
      if (m.version <= knownVersion) {
        const stmt = this.db.prepare(
          "INSERT INTO hardkas_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)"
        );
        stmt.run(m.version, m.name, m.checksum, new Date().toISOString()); // hardkas-determinism-allow: legacy bootstrap metadata
      }
    }
    return true;
  }
}

/**
 * Registry of all query-store migrations.
 * Version 1: Initial schema (Baseline 0.11.1-alpha).
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    checksum: "hardkas_v1_baseline",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS artifacts (
          artifact_id TEXT PRIMARY KEY,
          content_hash TEXT NOT NULL,
          schema TEXT NOT NULL,
          version TEXT NOT NULL,
          kind TEXT NOT NULL,
          mode TEXT NOT NULL DEFAULT 'unknown',
          network_id TEXT NOT NULL,
          tx_id TEXT,
          created_at TEXT,
          raw_json TEXT NOT NULL,
          file_path TEXT,
          file_mtime_ms INTEGER,
          indexed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_artifacts_content_hash ON artifacts(content_hash);
        CREATE INDEX IF NOT EXISTS idx_artifacts_schema ON artifacts(schema);
        CREATE INDEX IF NOT EXISTS idx_artifacts_kind ON artifacts(kind);
        CREATE INDEX IF NOT EXISTS idx_artifacts_mode ON artifacts(mode);
        CREATE INDEX IF NOT EXISTS idx_artifacts_network_id ON artifacts(network_id);
        CREATE INDEX IF NOT EXISTS idx_artifacts_tx_id ON artifacts(tx_id);
        CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at);
        CREATE INDEX IF NOT EXISTS idx_artifacts_file_path ON artifacts(file_path);

        CREATE TABLE IF NOT EXISTS lineage_edges (
          lineage_id TEXT NOT NULL,
          parent_artifact_id TEXT NOT NULL,
          child_artifact_id TEXT NOT NULL,
          edge_kind TEXT NOT NULL,
          created_at TEXT,
          PRIMARY KEY (parent_artifact_id, child_artifact_id),
          FOREIGN KEY (parent_artifact_id) REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
          FOREIGN KEY (child_artifact_id) REFERENCES artifacts(artifact_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_lineage_parent ON lineage_edges(parent_artifact_id);
        CREATE INDEX IF NOT EXISTS idx_lineage_child ON lineage_edges(child_artifact_id);
        CREATE INDEX IF NOT EXISTS idx_lineage_id ON lineage_edges(lineage_id);

        CREATE TABLE IF NOT EXISTS events (
          event_id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          domain TEXT NOT NULL,
          timestamp TEXT,
          workflow_id TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          causation_id TEXT,
          tx_id TEXT,
          artifact_id TEXT,
          network_id TEXT NOT NULL,
          raw_json TEXT NOT NULL,
          file_path TEXT,
          file_mtime_ms INTEGER,
          indexed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
        CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain);
        CREATE INDEX IF NOT EXISTS idx_events_workflow_id ON events(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
        CREATE INDEX IF NOT EXISTS idx_events_causation_id ON events(causation_id);
        CREATE INDEX IF NOT EXISTS idx_events_tx_id ON events(tx_id);
        CREATE INDEX IF NOT EXISTS idx_events_artifact_id ON events(artifact_id);
        CREATE INDEX IF NOT EXISTS idx_events_network_id ON events(network_id);
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_events_file_path ON events(file_path);

        CREATE TABLE IF NOT EXISTS traces (
          trace_id TEXT PRIMARY KEY,
          workflow_id TEXT UNIQUE NOT NULL,
          root_event_id TEXT,
          status TEXT NOT NULL,
          started_at TEXT,
          ended_at TEXT,
          FOREIGN KEY (root_event_id) REFERENCES events(event_id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_traces_workflow_id ON traces(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);
      `);
    }
  },
  {
    version: 2,
    name: "event_persistence_guarantees",
    checksum: "hardkas_v2_events",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS events_v2 (
          event_id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          domain TEXT NOT NULL,
          timestamp TEXT,
          emitted_at TEXT,
          workflow_id TEXT NOT NULL,
          correlation_id TEXT NOT NULL,
          causation_id TEXT,
          tx_id TEXT,
          artifact_id TEXT,
          network_id TEXT NOT NULL,
          sequence_number INTEGER NOT NULL DEFAULT 0,
          global_offset INTEGER,
          source_subsystem TEXT NOT NULL DEFAULT 'unknown',
          raw_json TEXT NOT NULL,
          file_path TEXT,
          file_mtime_ms INTEGER,
          indexed_at TEXT,
          UNIQUE(correlation_id, sequence_number, kind)
        );

        INSERT INTO events_v2 (
          event_id, kind, domain, timestamp, emitted_at, workflow_id, correlation_id, causation_id,
          tx_id, artifact_id, network_id, sequence_number, source_subsystem, raw_json, file_path, file_mtime_ms, indexed_at
        )
        SELECT 
          event_id, kind, domain, timestamp, timestamp, workflow_id, correlation_id, causation_id,
          tx_id, artifact_id, network_id, 0, 'legacy', raw_json, file_path, file_mtime_ms, indexed_at
        FROM events;

        DROP TABLE events;
        ALTER TABLE events_v2 RENAME TO events;

        CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
        CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain);
        CREATE INDEX IF NOT EXISTS idx_events_workflow_id ON events(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
        CREATE INDEX IF NOT EXISTS idx_events_causation_id ON events(causation_id);
        CREATE INDEX IF NOT EXISTS idx_events_tx_id ON events(tx_id);
        CREATE INDEX IF NOT EXISTS idx_events_artifact_id ON events(artifact_id);
        CREATE INDEX IF NOT EXISTS idx_events_network_id ON events(network_id);
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_events_file_path ON events(file_path);
        CREATE INDEX IF NOT EXISTS idx_events_global_offset ON events(global_offset);
      `);
    }
  },
  {
    version: 3,
    name: "lineage_closure_and_scale_indices",
    checksum: "hardkas_v3_lineage_scale",
    up: (db) => {
      db.exec(`
        -- Lineage closure table: transitive ancestor/descendant relationships
        -- Enables O(1) "is X an ancestor of Y?" queries without recursive CTEs
        CREATE TABLE IF NOT EXISTS lineage_closure (
          ancestor_id TEXT NOT NULL,
          descendant_id TEXT NOT NULL,
          depth INTEGER NOT NULL DEFAULT 1,
          path_hash TEXT,
          created_at TEXT,
          PRIMARY KEY (ancestor_id, descendant_id),
          FOREIGN KEY (ancestor_id) REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
          FOREIGN KEY (descendant_id) REFERENCES artifacts(artifact_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_closure_ancestor ON lineage_closure(ancestor_id);
        CREATE INDEX IF NOT EXISTS idx_closure_descendant ON lineage_closure(descendant_id);
        CREATE INDEX IF NOT EXISTS idx_closure_depth ON lineage_closure(depth);

        -- Add depth column to lineage_edges for direct edge depth tracking
        ALTER TABLE lineage_edges ADD COLUMN depth INTEGER NOT NULL DEFAULT 1;

        -- File mtime index for incremental sync: skip unchanged files
        CREATE INDEX IF NOT EXISTS idx_artifacts_file_mtime_ms ON artifacts(file_mtime_ms);

        -- Lineage statistics metadata view for scale monitoring
        CREATE TABLE IF NOT EXISTS lineage_stats (
          stat_key TEXT PRIMARY KEY,
          stat_value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        -- Pruning history: track what was pruned and when
        CREATE TABLE IF NOT EXISTS prune_history (
          prune_id TEXT PRIMARY KEY,
          pruned_at TEXT NOT NULL,
          artifacts_pruned INTEGER NOT NULL DEFAULT 0,
          traces_pruned INTEGER NOT NULL DEFAULT 0,
          events_pruned INTEGER NOT NULL DEFAULT 0,
          lineage_roots_preserved INTEGER NOT NULL DEFAULT 0,
          total_bytes_freed INTEGER NOT NULL DEFAULT 0
        );
      `);
    }
  }
];
