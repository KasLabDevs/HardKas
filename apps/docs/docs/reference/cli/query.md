---
title: hardkas query
---

# `hardkas query`

## `hardkas query artifacts list`

### Synopsis (Generated)

**Purpose:** List artifacts matching filters

**Aliases:** `ls`

#### Options

- `--schema &lt;schema&gt;`: Filter by artifact schema (e.g. txPlan, signedTx)
- `--network &lt;network&gt;`: Filter by network ID
- `--mode &lt;mode&gt;`: Filter by mode (simulated/real)
- `--from &lt;address&gt;`: Filter by sender address
- `--to &lt;address&gt;`: Filter by recipient address
- `--sort &lt;field:dir&gt;`: Sort field and direction (e.g. createdAt:desc)
- `--limit &lt;n&gt;` (Default: `100`): Max results
- `--json` (Default: `false`): Output as deterministic JSON
- `--explain [level]`: Attach explain chains (brief|full)

---

## `hardkas query artifacts inspect`

### Synopsis (Generated)

**Purpose:** Deep structural analysis of an artifact (path or contentHash)

#### Arguments

- `&lt;target&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON
- `--explain [level]`: Attach explain chains (brief|full)

---

## `hardkas query artifacts diff`

### Synopsis (Generated)

**Purpose:** Semantic diff between two artifacts

#### Arguments

- `&lt;left&gt;` (Required): 
- `&lt;right&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas query store doctor`

### Synopsis (Generated)

**Purpose:** Integrity and freshness check of the query store index

#### Options

- `--migrate` (Default: `false`): Apply pending migrations if found
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms

---

## `hardkas query store migrate`

### Synopsis (Generated)

**Purpose:** Apply pending schema migrations to the query store

#### Options

- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms

---

## `hardkas query store sync`

### Synopsis (Generated)

**Purpose:** Synchronize the filesystem artifacts with the query store index

**Aliases:** `index`

#### Options

- `--strict` (Default: `false`): Fail on any corrupted data
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output as JSON

### Semantic Contract (Curated)

- **Environments:** Local Workspace
- **Reads:** .hardkas/artifacts/ (all files), .hardkas/events.jsonl
- **Writes:** .hardkas/store.db (SQLite read-model)
- **⚠️ Side Effects:** Rebuilds the ephemeral query projection from the Canonical Store.
- **Evidence Semantics:** Ensures the Query Store is in strict parity with the durable evidence DAG.

---

## `hardkas query store rebuild`

### Synopsis (Generated)

**Purpose:** Force a complete rebuild of the query store index

#### Options

- `--backend &lt;type&gt;`: Backend to use (sqlite/filesystem)
- `--strict` (Default: `false`): Fail on any corrupted data
- `--wait-lock` (Default: `false`): Wait for workspace lock if held
- `--lock-timeout &lt;ms&gt;` (Default: `30000`): Lock wait timeout in ms
- `--json` (Default: `false`): Output as JSON

---

## `hardkas query store sql`

### Synopsis (Generated)

**Purpose:** Run a raw SQL query against the query store

#### Arguments

- `&lt;query&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON
- `--unsafe-write` (Default: `false`): Allow mutating SQL (DANGEROUS)
- `--yes` (Default: `false`): Confirm mutating SQL (DANGEROUS)

---

## `hardkas query store export`

### Synopsis (Generated)

**Purpose:** Export logical store state to JSON

#### Options

- `--output &lt;path&gt;`: Output file path

---

## `hardkas query lineage chain`

### Synopsis (Generated)

**Purpose:** Reconstruct lineage chain from an artifact (contentHash or artifactId)

#### Arguments

- `&lt;anchor&gt;` (Required): 

#### Options

- `--direction &lt;dir&gt;` (Default: `ancestors`): Traversal direction: ancestors or descendants
- `--json` (Default: `false`): Output as JSON
- `--explain [level]`: Attach explain chains (brief|full)
- `--why`: Shorthand for --explain full

---

## `hardkas query lineage transitions`

### Synopsis (Generated)

**Purpose:** List all lineage transitions

#### Options

- `--root &lt;hash&gt;`: Filter by root artifact ID
- `--json` (Default: `false`): Output as JSON
- `--explain [level]`: Attach explain chains (brief|full)
- `--why`: Shorthand for --explain full

---

## `hardkas query lineage orphans`

### Synopsis (Generated)

**Purpose:** Find artifacts with broken lineage references

#### Options

- `--json` (Default: `false`): Output as JSON
- `--explain [level]`: Attach explain chains (brief|full)

---

## `hardkas query replay list`

### Synopsis (Generated)

**Purpose:** List all stored receipts

**Aliases:** `ls`

#### Options

- `--status &lt;status&gt;`: Filter by status
- `--json` (Default: `false`): Output as JSON
- `--limit &lt;n&gt;` (Default: `100`): Max results

---

## `hardkas query replay summary`

### Synopsis (Generated)

**Purpose:** Detailed receipt + trace summary for a transaction

#### Arguments

- `&lt;txId&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas query replay divergences`

### Synopsis (Generated)

**Purpose:** Detect receipts with replay divergence indicators

#### Options

- `--json` (Default: `false`): Output as JSON
- `--explain [level]`: Attach explain chains (brief|full)

---

## `hardkas query replay invariants`

### Synopsis (Generated)

**Purpose:** Check replay invariants for a specific transaction

#### Arguments

- `&lt;txId&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON
- `--explain [level]`: Attach explain chains (brief|full)

---

## `hardkas query dag conflicts`

### Synopsis (Generated)

**Purpose:** Show double-spend conflict analysis

#### Options

- `--json` (Default: `false`): Output as JSON
- `--explain [level]`: Attach explain chains (brief|full)
- `--why`: Shorthand for --explain full

---

## `hardkas query dag displaced`

### Synopsis (Generated)

**Purpose:** Show displaced transactions

#### Options

- `--json` (Default: `false`): Output as JSON
- `--explain [level]`: Attach explain chains (brief|full)

---

## `hardkas query dag history`

### Synopsis (Generated)

**Purpose:** Full lifecycle of a transaction through the DAG

#### Arguments

- `&lt;txId&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON
- `--explain [level]`: Attach explain chains (brief|full)
- `--why`: Shorthand for --explain full

---

## `hardkas query dag sink-path`

### Synopsis (Generated)

**Purpose:** Show current selected path from genesis to sink

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas query dag anomalies`

### Synopsis (Generated)

**Purpose:** Find transactions or blocks in unexpected states

#### Options

- `--json` (Default: `false`): Output as JSON
- `--explain [level]`: Attach explain chains (brief|full)

---

## `hardkas query events`

### Synopsis (Generated)

**Purpose:** Query event log

#### Options

- `--tx &lt;txId&gt;`: Filter events by transaction ID
- `--domain &lt;domain&gt;`: Filter by event domain
- `--kind &lt;kind&gt;`: Filter by event kind
- `--workflow &lt;workflowId&gt;`: Filter by workflow ID
- `--limit &lt;n&gt;` (Default: `100`): Max results
- `--json` (Default: `false`): Output as deterministic JSON
- `--explain [level]`: Attach explain metadata (brief|full)

---

## `hardkas query tx`

### Synopsis (Generated)

**Purpose:** Aggregate all data for a transaction stable

#### Arguments

- `&lt;txId&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as deterministic JSON
- `--explain [level]`: Attach explain metadata (brief|full)

---

