import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { DDL, SCHEMA_VERSION } from "./schema.js";

export class HardkasStore {
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;

  constructor(options: { dbPath?: string, memory?: boolean } = {}) {
    if (options.memory) {
      this.dbPath = ":memory:";
    } else {
      this.dbPath = options.dbPath || path.join(process.cwd(), ".hardkas", "store.db");
    }
  }

  public connect() {
    if (this.db) return;

    if (this.dbPath !== ":memory:") {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initialize();
  }

  public disconnect() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  public getDatabase(): DatabaseSync {
    if (!this.db) {
      throw new Error("Store not connected. Call connect() first.");
    }
    return this.db;
  }

  private initialize() {
    if (!this.db) return;

    // Enable WAL mode for better concurrency
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");

    // Apply schema
    this.db.exec(DDL);

    // Check version
    const stmt = this.db.prepare("SELECT value FROM metadata WHERE key = 'version'");
    let version = 0;
    try {
      const row = stmt.get() as { value: string } | undefined;
      if (row) {
        version = parseInt(row.value, 10);
      }
    } catch (e) {
      // Ignore if table was just created
    }

    if (version === 0) {
      const insert = this.db.prepare("INSERT INTO metadata (key, value) VALUES ('version', ?)");
      insert.run(SCHEMA_VERSION.toString());
    } else if (version !== SCHEMA_VERSION) {
      console.warn(`Schema version mismatch (expected ${SCHEMA_VERSION}, got ${version}). Developer Preview: Recreating schema.`);
      
      // Developer Preview Migration: Drop and Recreate
      this.db.exec("PRAGMA foreign_keys = OFF;");
      this.db.exec("DROP TABLE IF EXISTS artifacts;");
      this.db.exec("DROP TABLE IF EXISTS lineage_edges;");
      this.db.exec("DROP TABLE IF EXISTS events;");
      this.db.exec("DROP TABLE IF EXISTS traces;");
      this.db.exec("DROP TABLE IF EXISTS metadata;");
      this.db.exec("PRAGMA foreign_keys = ON;");
      
      // Re-initialize
      this.db.exec(DDL);
      const insert = this.db.prepare("INSERT INTO metadata (key, value) VALUES ('version', ?)");
      insert.run(SCHEMA_VERSION.toString());
    }
  }
}
