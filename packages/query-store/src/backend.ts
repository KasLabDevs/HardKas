import { HardkasStore } from "./db.js";
import { ExecutionMode, NetworkId } from "@hardkas/core";

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
  findArtifacts(filters?: { schema?: string; mode?: string; networkId?: string }): Promise<ArtifactDocument[]>;
  getArtifact(idOrHash: string): Promise<ArtifactDocument | null>;
  getEvents(filters?: { kind?: string; txId?: string }): Promise<EventDocument[]>;
  getLineageEdges(filters?: { parentHash?: string; childHash?: string }): Promise<LineageEdgeDocument[]>;
  getStoreStatus(): Promise<string>;
  doctor(): Promise<any>;
  rebuild(): Promise<void>;
  findReceipts(filters?: { status?: string; networkId?: string }): Promise<ArtifactDocument[]>;
  findTraces(filters?: { txId?: string }): Promise<ArtifactDocument[]>;
}

export class SqliteQueryBackend implements QueryBackend {
  private store: HardkasStore;

  constructor(store: HardkasStore) {
    this.store = store;
  }

  isReady(): boolean {
    return this.store.getDatabase() !== null;
  }

  kind(): "sqlite" {
    return "sqlite";
  }

  async findArtifacts(filters?: { schema?: string; mode?: string; networkId?: string }): Promise<ArtifactDocument[]> {
    const db = this.store.getDatabase();
    
    let query = "SELECT * FROM artifacts WHERE 1=1";
    const params: any[] = [];
    
    if (filters?.schema) {
      query += " AND schema = ?";
      params.push(filters.schema);
    }
    if (filters?.mode) {
      query += " AND kind = ?"; // Note: kind stores mode info in simple schemas
      params.push(filters.mode);
    }
    if (filters?.networkId) {
      query += " AND network_id = ?";
      params.push(filters.networkId);
    }
    
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(r => ({
      contentHash: r.content_hash,
      schema: r.schema,
      version: r.version,
      kind: r.kind,
      mode: r.kind as ExecutionMode, // Match mode to kind for now
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
    
    const row = db.prepare("SELECT * FROM artifacts WHERE artifact_id = ? OR content_hash = ? OR tx_id = ?").get(idOrHash, idOrHash, idOrHash) as any;
    
    if (!row) return null;
    
    return {
      contentHash: row.content_hash,
      schema: row.schema,
      version: row.version,
      kind: row.kind,
      mode: row.kind as ExecutionMode,
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
    
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(r => ({
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

  async getLineageEdges(filters?: { parentHash?: string; childHash?: string }): Promise<LineageEdgeDocument[]> {
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
    
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(r => ({
      parentArtifactId: r.parent_artifact_id,
      childArtifactId: r.child_artifact_id,
      lineageId: r.lineage_id,
      rule: r.edge_kind,
      createdAt: r.created_at
    }));
  }

  async findReceipts(filters?: { status?: string; networkId?: string }): Promise<ArtifactDocument[]> {
    return this.findArtifacts({ schema: "hardkas.txReceipt", ...filters });
  }

  async findTraces(filters?: { txId?: string }): Promise<ArtifactDocument[]> {
    const db = this.store.getDatabase();
    let query = "SELECT * FROM artifacts WHERE schema = 'hardkas.txTrace'";
    const params: any[] = [];
    
    if (filters?.txId) {
      query += " AND tx_id = ?";
      params.push(filters.txId);
    }
    
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(r => ({
      contentHash: r.content_hash,
      schema: r.schema,
      version: r.version,
      kind: r.kind,
      mode: r.kind as ExecutionMode,
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
    return indexer.doctor();
  }

  async rebuild(): Promise<void> {
    const { HardkasIndexer } = await import("./indexer.js");
    const indexer = new HardkasIndexer(this.store.getDatabase());
    indexer.rebuild();
  }
}
