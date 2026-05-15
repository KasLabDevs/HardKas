import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import path from "node:path";
import fs from "node:fs";
import { HardkasError, CorruptionIssue } from "@hardkas/core";
import { SCHEMA_VERSION } from "./schema.js";
import { MigrationRunner, MIGRATIONS } from "./migrations.js";

export class HardkasStore {
  private db: any | null = null;
  private readonly dbPath: string;

  constructor(options: { dbPath?: string, memory?: boolean } = {}) {
    if (options.memory) {
      this.dbPath = ":memory:";
    } else {
      this.dbPath = options.dbPath || path.join(process.cwd(), ".hardkas", "store.db");
    }
  }

  public connect(options: { autoMigrate?: boolean } = { autoMigrate: false }) {
    if (this.db) return;

    if (this.dbPath !== ":memory:") {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    
    // Core SQLite tuning
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = FULL;");
    this.db.exec("PRAGMA foreign_keys = ON;");

    if (options.autoMigrate) {
      this.initialize();
    }
  }

  public disconnect() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  public getDatabase(): any {
    if (!this.db) {
      throw new Error("Store not connected. Call connect() first.");
    }
    return this.db;
  }

  /**
   * Safe migration entry point.
   * Must be called under query-store lock for non-memory DBs.
   */
  public migrate(): { applied: number; status: string } {
    if (!this.db) throw new Error("Database not connected");

    const runner = new MigrationRunner(this.db);
    
    // 1. Handle legacy transition (version 1 baseline)
    runner.bootstrapLegacy(1, MIGRATIONS);

    // 2. Run pending migrations
    return runner.migrate(MIGRATIONS);
  }

  private initialize() {
    if (!this.db) return;

    // We only perform non-destructive initialization here.
    // Full migrations or rebuilds are triggered via migrate() or indexer.
    try {
      this.migrate();
    } catch (e) {
      // If auto-migration fails during connect, we log but don't crash
      // unless it's a critical error. The doctor will catch it.
      if (e instanceof HardkasError && e.code === "STORE_MIGRATION_CHECKSUM_MISMATCH") {
        console.error(`\n  ❌ ${e.message}`);
      }
    }
  }

  /**
   * Performs a health check on the store.
   */
  public checkHealth(): { ok: boolean; issues: CorruptionIssue[] } {
    const issues: CorruptionIssue[] = [];
    
    if (this.dbPath === ":memory:") return { ok: true, issues: [] };

    if (!fs.existsSync(this.dbPath)) {
      issues.push({
        code: "STORE_REBUILD_REQUIRED",
        severity: "error",
        message: "Query store database file is missing.",
        suggestion: "Run 'hardkas query store rebuild' to recreate the read model."
      });
      return { ok: false, issues };
    }

    try {
      const stats = fs.statSync(this.dbPath);
      if (stats.size === 0) {
        issues.push({
          code: "STORE_CORRUPT",
          severity: "error",
          message: "Query store database file is empty.",
          suggestion: "Run 'hardkas query store rebuild'."
        });
      }
    } catch (e) {
      issues.push({
        code: "STORE_CORRUPT",
        severity: "error",
        message: `Failed to access store database: ${e instanceof Error ? e.message : String(e)}`
      });
    }

    // Migration/Version check
    if (this.db) {
      try {
        const runner = new MigrationRunner(this.db);
        const applied = runner.getAppliedMigrations();
        const appliedMap = new Map(applied.map(m => [m.version, m]));

        const pending = MIGRATIONS.filter((m: any) => !appliedMap.has(m.version));
        
        if (pending.length > 0) {
          issues.push({
            code: "STORE_MIGRATION_REQUIRED",
            severity: "warning",
            message: `${pending.length} pending schema migration(s) detected.`,
            suggestion: "Run 'hardkas query store migrate' or 'hardkas query store rebuild'."
          });
        }

        // Checksums
        for (const m of MIGRATIONS) {
          const existing = appliedMap.get(m.version);
          if (existing && existing.checksum !== m.checksum) {
            issues.push({
              code: "STORE_MIGRATION_CHECKSUM_MISMATCH",
              severity: "error",
              message: `Integrity violation: Migration ${m.version} checksum changed.`,
              suggestion: "The database schema was modified externally or migrations were edited. A full rebuild is recommended."
            });
          }
        }
      } catch (e) {
        issues.push({
          code: "STORE_CORRUPT",
          severity: "error",
          message: "Could not read migration history from store database."
        });
      }
    }

    return { ok: issues.length === 0, issues };
  }
}
