import type { ArtifactType, ExecutionMode, NetworkId } from "@hardkas/core";

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
  readonly timestamp: string | null;
  readonly workflowId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly txId: string | null;
  readonly artifactId: string | null;
  readonly networkId: string;
  readonly payload: any;
}

export interface LineageEdgeDocument {
  readonly parentArtifactId: string;
  readonly childArtifactId: string;
  readonly lineageId: string;
  readonly rule: string;
  readonly createdAt: string | null;
}

/**
 * Common storage backend interface for QueryEngine.
 * Allows switching between filesystem/memory and SQLite.
 */
export interface QueryBackend {
  /** Check if the backend is ready/connected. */
  isReady(): boolean;

  /** Backend identifier for diagnostics. */
  kind(): "sqlite" | "filesystem";
  
  /** Find artifacts matching optional basic filters. */
  findArtifacts(filters?: { schema?: string; mode?: string; networkId?: string }): Promise<ArtifactDocument[]>;
  
  /** Get a specific artifact by content hash or artifact ID. */
  getArtifact(idOrHash: string): Promise<ArtifactDocument | null>;
  
  /** Get events matching optional filters. */
  getEvents(filters?: { kind?: string; txId?: string }): Promise<EventDocument[]>;
  
  /** Get lineage edges. */
  getLineageEdges(filters?: { parentHash?: string; childHash?: string }): Promise<LineageEdgeDocument[]>;

  /** Get the current freshness/health status of the store. */
  getStoreStatus(): Promise<string>;

  /** Perform index integrity check. */
  doctor(): Promise<any>;

  /** Atomic wipe and rebuild. */
  rebuild(options?: { strict?: boolean }): Promise<any>;

  /** Incremental index update. */
  sync(options?: { strict?: boolean }): Promise<any>;

  /** Apply pending schema migrations. */
  migrate(): Promise<{ applied: number }>;

  /** Execute raw SQL (if supported). */
  executeRawSql(sql: string): Promise<any[]>;

  /** Find all transaction receipts (for replay analysis). */
  findReceipts(filters?: { status?: string; networkId?: string }): Promise<ArtifactDocument[]>;
  
  /** Find all transaction traces. */
  findTraces(filters?: { txId?: string }): Promise<ArtifactDocument[]>;
}
