import { HardkasStore } from "./db.js";
import { ExecutionMode, NetworkId } from "@hardkas/core";
import { HardkasSchemas } from "@hardkas/artifacts";

// ---------------------------------------------------------------------------
// Database Row definitions for typed SQLite mapping.
// ---------------------------------------------------------------------------

export interface DbArtifactRow {
  readonly artifact_id: string;
  readonly content_hash: string;
  readonly schema: string;
  readonly version: string;
  readonly kind: string;
  readonly mode: string;
  readonly network_id: string;
  readonly tx_id: string | null;
  readonly created_at: string | null;
  readonly raw_json: string;
  readonly file_path: string | null;
  readonly file_mtime_ms: number | null;
  readonly indexed_at: string | null;
}

export interface DbEventRow {
  readonly event_id: string;
  readonly kind: string;
  readonly domain: string;
  readonly timestamp: string | null;
  readonly emitted_at: string | null;
  readonly workflow_id: string;
  readonly correlation_id: string;
  readonly causation_id: string | null;
  readonly tx_id: string | null;
  readonly artifact_id: string | null;
  readonly network_id: string;
  readonly sequence_number: number;
  readonly global_offset: number | null;
  readonly source_subsystem: string;
  readonly raw_json: string;
  readonly file_path: string | null;
  readonly file_mtime_ms: number | null;
  readonly indexed_at: string | null;
}

export interface DbLineageEdgeRow {
  readonly lineage_id: string;
  readonly parent_artifact_id: string;
  readonly child_artifact_id: string;
  readonly edge_kind: string;
  readonly created_at: string | null;
}

// ---------------------------------------------------------------------------
// Backend DTO types — local definitions to avoid circular dependency.
// These are persistence DTOs owned by the store layer.
// ---------------------------------------------------------------------------

export interface ArtifactDocument {
  readonly contentHash: string;
  readonly schema: string;
  readonly version: string;
  readonly kind: string;
  readonly mode: ExecutionMode;
  readonly networkId: NetworkId;
  readonly createdAt: string | null;
  readonly txId: string | null;
  readonly artifactId: string;
  readonly path: string;
  readonly payload: any;
}

export interface EventDocument {
  readonly eventId: string;
  readonly kind: string;
  readonly domain: string;
  readonly workflowId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly txId: string | null;
  readonly artifactId: string | null;
  readonly networkId: string;
  readonly timestamp: string | null;
  readonly payload: unknown;
}

export interface LineageEdgeDocument {
  readonly parentArtifactId: string;
  readonly childArtifactId: string;
  readonly lineageId: string;
  readonly rule: string;
  readonly createdAt: string | null;
}

export interface QueryBackend {
  isReady(): boolean;
  kind(): "sqlite" | "filesystem";
  findArtifacts(filters?: {
    schema?: string;
    mode?: string;
    networkId?: string;
  }): Promise<ArtifactDocument[]>;
  getArtifact(idOrHash: string): Promise<ArtifactDocument | null>;
  getEvents(filters?: { kind?: string; txId?: string }): Promise<EventDocument[]>;
  getLineageEdges(filters?: {
    parentHash?: string;
    childHash?: string;
  }): Promise<LineageEdgeDocument[]>;
  getStoreStatus(): Promise<string>;
  doctor(): Promise<any>;
  migrate(): Promise<{ applied: number }>;
  sync(options?: { strict?: boolean; cwd?: string }): Promise<any>;
  syncPaths(paths: string[], options?: { strict?: boolean; cwd?: string }): Promise<any>;
  rebuild(options?: { strict?: boolean; cwd?: string }): Promise<any>;
  /**
   * @deprecated BOUNDARY DINÁMICO: Este es el ÚNICO boundary dinámico aceptado en el sistema
   * que puede retornar `any[]` de forma intencional (SQLite devuelve filas genéricas).
   * Todos los llamadores DEBEN validar el output estrictamente en runtime mediante guards.
   */
  executeRawSql(sql: string, options?: { unsafeWrite?: boolean; yes?: boolean }): Promise<any[]>;
  findReceipts(filters?: {
    status?: string;
    networkId?: string;
  }): Promise<ArtifactDocument[]>;
  findTraces(filters?: { txId?: string }): Promise<ArtifactDocument[]>;
}

export class SqliteQueryBackend implements QueryBackend {
  private store: HardkasStore;

  constructor(store: HardkasStore) {
    this.store = store;
  }

  isReady(): boolean {
    try {
      return this.store.getDatabase() !== null;
    } catch (e) {
      return false;
    }
  }

  kind(): "sqlite" {
    return "sqlite";
  }

  async findArtifacts(filters?: {
    schema?: string;
    mode?: string;
    networkId?: string;
  }): Promise<ArtifactDocument[]> {
    const db = this.store.getDatabase();

    // Force SQLite to flush WAL entries to visibility for this read connection
    try {
      db.pragma("wal_checkpoint(PASSIVE)");
    } catch (e) {}

    let query = "SELECT * FROM artifacts WHERE 1=1";
    const params: any[] = [];

    if (filters?.schema) {
      query += " AND schema LIKE ?";
      params.push(`${filters.schema}%`);
    }
    if (filters?.mode) {
      query += " AND mode = ?";
      params.push(filters.mode);
    }
    if (filters?.networkId) {
      query += " AND network_id = ?";
      params.push(filters.networkId);
    }

    const rows = db.prepare(query).all(...params) as DbArtifactRow[];
    return rows.map((r) => ({
      contentHash: r.content_hash,
      schema: r.schema,
      version: r.version,
      kind: r.kind,
      mode: (r.mode || "unknown") as ExecutionMode,
      networkId: r.network_id as NetworkId,
      createdAt: r.created_at,
      txId: r.tx_id,
      artifactId: r.artifact_id,
      path: r.file_path || r.artifact_id,
      payload: JSON.parse(r.raw_json)
    }));
  }

  async getArtifact(idOrHash: string): Promise<ArtifactDocument | null> {
    const db = this.store.getDatabase();

    const row = db
      .prepare(
        "SELECT * FROM artifacts WHERE artifact_id = ? OR content_hash = ? OR tx_id = ?"
      )
      .get(idOrHash, idOrHash, idOrHash) as DbArtifactRow | undefined;

    if (!row) return null;

    return {
      contentHash: row.content_hash,
      schema: row.schema,
      version: row.version,
      kind: row.kind,
      mode: (row.mode || "unknown") as ExecutionMode,
      networkId: row.network_id as NetworkId,
      createdAt: row.created_at,
      txId: row.tx_id,
      artifactId: row.artifact_id,
      path: row.file_path || row.artifact_id,
      payload: JSON.parse(row.raw_json)
    };
  }

  async getEvents(filters?: { kind?: string; txId?: string }): Promise<EventDocument[]> {
    const db = this.store.getDatabase();

    let query = "SELECT * FROM events WHERE 1=1";
    const params: any[] = [];

    if (filters?.kind) {
      query += " AND kind = ?";
      params.push(filters.kind);
    }
    if (filters?.txId) {
      query += " AND tx_id = ?";
      params.push(filters.txId);
    }

    const rows = db.prepare(query).all(...params) as DbEventRow[];
    return rows.map((r) => ({
      eventId: r.event_id,
      kind: r.kind,
      domain: r.domain,
      workflowId: r.workflow_id,
      correlationId: r.correlation_id,
      causationId: r.causation_id,
      txId: r.tx_id,
      artifactId: r.artifact_id,
      networkId: r.network_id,
      timestamp: r.timestamp,
      payload: JSON.parse(r.raw_json).payload
    }));
  }

  async getLineageEdges(filters?: {
    parentHash?: string;
    childHash?: string;
  }): Promise<LineageEdgeDocument[]> {
    const db = this.store.getDatabase();

    let query = "SELECT * FROM lineage_edges WHERE 1=1";
    const params: any[] = [];

    if (filters?.parentHash) {
      query += " AND parent_artifact_id = ?";
      params.push(filters.parentHash);
    }
    if (filters?.childHash) {
      query += " AND child_artifact_id = ?";
      params.push(filters.childHash);
    }

    const rows = db.prepare(query).all(...params) as DbLineageEdgeRow[];
    return rows.map((r) => ({
      parentArtifactId: r.parent_artifact_id,
      childArtifactId: r.child_artifact_id,
      lineageId: r.lineage_id,
      rule: r.edge_kind,
      createdAt: r.created_at
    }));
  }

  async findReceipts(filters?: {
    status?: string;
    networkId?: string;
  }): Promise<ArtifactDocument[]> {
    return this.findArtifacts({ schema: HardkasSchemas.TxReceipt, ...filters });
  }

  async findTraces(filters?: { txId?: string }): Promise<ArtifactDocument[]> {
    const db = this.store.getDatabase();
    let query = "SELECT * FROM artifacts WHERE schema = ?";
    const params: any[] = [HardkasSchemas.TxTrace];

    if (filters?.txId) {
      query += " AND tx_id = ?";
      params.push(filters.txId);
    }

    const rows = db.prepare(query).all(...params) as DbArtifactRow[];
    return rows.map((r) => ({
      contentHash: r.content_hash,
      schema: r.schema,
      version: r.version,
      kind: r.kind,
      mode: (r.mode || "unknown") as ExecutionMode,
      networkId: r.network_id as NetworkId,
      createdAt: r.created_at,
      txId: r.tx_id,
      artifactId: r.artifact_id,
      path: r.file_path || r.artifact_id,
      payload: JSON.parse(r.raw_json)
    }));
  }

  async getStoreStatus(): Promise<string> {
    const { HardkasIndexer } = await import("./indexer.js");
    const indexer = new HardkasIndexer(this.store.getDatabase());
    const report = indexer.doctor();
    return report.ok ? "fresh" : "stale";
  }

  async doctor(): Promise<any> {
    const { HardkasIndexer } = await import("./indexer.js");
    const indexer = new HardkasIndexer(this.store.getDatabase());
    const indexerReport = indexer.doctor();
    const storeHealth = this.store.checkHealth();

    return {
      ...indexerReport,
      ok: indexerReport.ok && storeHealth.ok,
      storeIssues: storeHealth.issues
    };
  }

  async migrate(): Promise<{ applied: number }> {
    return this.store.migrate();
  }

  async rebuild(options?: { strict?: boolean; cwd?: string }): Promise<any> {
    // Ensure schema is up to date before rebuild
    this.store.migrate();

    const { HardkasIndexer } = await import("./indexer.js");
    const indexer = new HardkasIndexer(this.store.getDatabase(), options);
    return indexer.rebuild();
  }

  async sync(options?: { strict?: boolean; cwd?: string }): Promise<any> {
    // Ensure schema is up to date before sync
    this.store.migrate();

    const { HardkasIndexer } = await import("./indexer.js");
    const indexer = new HardkasIndexer(this.store.getDatabase(), options);
    return indexer.sync();
  }

  async syncPaths(
    paths: string[],
    options?: { strict?: boolean; cwd?: string }
  ): Promise<any> {
    this.store.migrate();
    const { HardkasIndexer } = await import("./indexer.js");
    const indexer = new HardkasIndexer(this.store.getDatabase(), options);
    return indexer.syncPaths(paths);
  }

  executeRawSql(sql: string, options?: { unsafeWrite?: boolean; yes?: boolean }): Promise<any[]> {
    const classification = classifySqlSafety(sql);

    if (classification.kind === "write" || classification.kind === "unknown") {
      if (!options?.unsafeWrite && !options?.yes) {
        throw new Error("QUERY_STORE_READ_ONLY_VIOLATION: Query store is a derived projection. Artifacts are the source of truth. Mutation may corrupt projections. Use --unsafe-write and --yes to intentionally proceed.");
      }
      if (options?.unsafeWrite && !options?.yes) {
        throw new Error("QUERY_STORE_WRITE_REQUIRES_YES: Query store is a derived projection. Artifacts are the source of truth. Mutation may corrupt projections. Use --yes to intentionally proceed.");
      }
      if (!options?.unsafeWrite && options?.yes) {
        throw new Error("QUERY_STORE_WRITE_REQUIRES_UNSAFE_WRITE: Query store is a derived projection. Artifacts are the source of truth. Mutation may corrupt projections. Use --unsafe-write to intentionally proceed.");
      }
    }

    const db = this.store.getDatabase();

    // SQLite has a readonly setting when opening the connection, but better-sqlite3
    // opens a single connection for the whole app. We enforce lexical guards.
    // To support multiple statements or writes, if unsafe is permitted, we use db.exec or db.prepare appropriately.

    try {
      if (classification.kind === "write" || classification.kind === "unknown") {
         if (sql.includes(';')) {
             db.exec(sql);
             return Promise.resolve([]);
         } else {
             const stmt = db.prepare(sql);
             return Promise.resolve(stmt.all() as any[]);
         }
      } else {
         const stmt = db.prepare(sql);
         return Promise.resolve(stmt.all() as any[]);
      }
    } catch (e: unknown) {
        if (e instanceof Error && ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)).includes('cannot execute multiple statements')) {
             throw new Error("QUERY_STORE_READ_ONLY_VIOLATION: Multiple statements detected and blocked by default.");
        }
        throw e;
    }
  }
}

export function classifySqlSafety(sql: string): { kind: "read" | "write" | "unknown"; reason?: string; } {
  // 1. Remove multi-line comments /* ... */
  let cleanSql = sql.replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "");
  // 2. Remove single-line comments -- ...
  cleanSql = cleanSql.replace(/--.*$/gm, "");
  // 3. Trim
  cleanSql = cleanSql.trim().toUpperCase();

  if (!cleanSql) {
    return { kind: "unknown", reason: "Empty query" };
  }

  // 4. Multiple statements check
  // Just a simple check for semicolons that aren't at the very end
  const statements = cleanSql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  if (statements.length > 1) {
    return { kind: "unknown", reason: "Multiple statements detected" };
  }

  const firstTokenMatch = cleanSql.match(/^([A-Z]+)/);
  if (!firstTokenMatch) {
    return { kind: "unknown", reason: "Could not identify first token" };
  }

  const firstToken = firstTokenMatch[1];

  // Common safe read starts
  if (firstToken === "SELECT" || firstToken === "EXPLAIN" || firstToken === "PRAGMA") {
      // PRAGMA can be mutating (e.g. PRAGMA user_version = 1), but let's do a deeper check
      if (cleanSql.includes("INSERT ") || cleanSql.includes("UPDATE ") || cleanSql.includes("DELETE ") ||
          cleanSql.includes("DROP ") || cleanSql.includes("ALTER ") || cleanSql.includes("CREATE ") ||
          cleanSql.includes("REPLACE ") || cleanSql.includes("TRUNCATE ") || cleanSql.includes("VACUUM ") ||
          cleanSql.includes("ATTACH ") || cleanSql.includes("DETACH ") || cleanSql.includes("INTO ")) {
          return { kind: "write", reason: "Found mutating keyword" };
      }
      return { kind: "read" };
  }

  if (firstToken === "WITH") {
      // WITH ... SELECT ...
      if (cleanSql.includes("INSERT ") || cleanSql.includes("UPDATE ") || cleanSql.includes("DELETE ")) {
          return { kind: "write", reason: "Mutating CTE" };
      }
      return { kind: "read" };
  }

  return { kind: "write", reason: "Unrecognized or explicitly mutating first token" };
}
