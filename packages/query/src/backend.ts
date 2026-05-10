import type { ArtifactType, ExecutionMode, NetworkId } from "@hardkas/core";

export interface ArtifactDocument {
  readonly contentHash: string;
  readonly schema: string;
  readonly version: string;
  readonly mode: ExecutionMode;
  readonly networkId: NetworkId;
  readonly createdAt: string;
  readonly path: string;
  readonly payload: any;
}

export interface EventDocument {
  readonly id: number;
  readonly kind: string;
  readonly txId?: string;
  readonly endpoint?: string;
  readonly createdAt: string;
  readonly payload: any;
}

export interface LineageEdgeDocument {
  readonly parentHash: string;
  readonly childHash: string;
  readonly rule: string;
  readonly sequence?: number;
}

/**
 * Common storage backend interface for QueryEngine.
 * Allows switching between filesystem/memory and SQLite.
 */
export interface QueryBackend {
  /** Check if the backend is ready/connected. */
  isReady(): boolean;
  
  /** Find artifacts matching optional basic filters. */
  findArtifacts(filters?: { schema?: string; mode?: string; networkId?: string }): Promise<ArtifactDocument[]>;
  
  /** Get a specific artifact by content hash or artifact ID. */
  getArtifact(idOrHash: string): Promise<ArtifactDocument | null>;
  
  /** Get events matching optional filters. */
  getEvents(filters?: { kind?: string; txId?: string }): Promise<EventDocument[]>;
  
  /** Get lineage edges. */
  getLineageEdges(filters?: { parentHash?: string; childHash?: string }): Promise<LineageEdgeDocument[]>;
}
