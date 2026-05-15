export const SCHEMA_VERSION = 1;

export interface MetadataRow {
  key: string;
  value: string;
}

export interface ArtifactRow {
  artifact_id: string;
  content_hash: string;
  schema: string;
  version: string;
  kind: string;
  mode: string;
  network_id: string;
  tx_id?: string;
  created_at?: string;
  raw_json: string;
  file_path?: string;
  file_mtime_ms?: number;
  indexed_at?: string;
}
