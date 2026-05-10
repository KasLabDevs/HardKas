export const SCHEMA_VERSION = 2;

export const DDL = `
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
  network_id TEXT NOT NULL,
  tx_id TEXT,
  created_at TEXT,
  raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artifacts_content_hash ON artifacts(content_hash);
CREATE INDEX IF NOT EXISTS idx_artifacts_schema ON artifacts(schema);
CREATE INDEX IF NOT EXISTS idx_artifacts_kind ON artifacts(kind);
CREATE INDEX IF NOT EXISTS idx_artifacts_network_id ON artifacts(network_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_tx_id ON artifacts(tx_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at);

CREATE TABLE IF NOT EXISTS lineage_edges (
  lineage_id TEXT NOT NULL,
  parent_artifact_id TEXT NOT NULL,
  child_artifact_id TEXT NOT NULL,
  edge_kind TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (parent_artifact_id, child_artifact_id),
  FOREIGN KEY (parent_artifact_id) REFERENCES artifacts(artifact_id),
  FOREIGN KEY (child_artifact_id) REFERENCES artifacts(artifact_id)
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
  raw_json TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS traces (
  trace_id TEXT PRIMARY KEY,
  workflow_id TEXT UNIQUE NOT NULL,
  root_event_id TEXT,
  status TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  FOREIGN KEY (root_event_id) REFERENCES events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_traces_workflow_id ON traces(workflow_id);
CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);
`;
