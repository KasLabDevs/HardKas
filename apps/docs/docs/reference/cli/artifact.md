---
title: hardkas artifact
---

# `hardkas artifact`

## `hardkas artifact create`

### Synopsis (Generated)

**Purpose:** Wrap a JSON payload as a content-hashed artifact under a free &lt;type&gt; label; the payload is not validated against any schema (schemaValidation: NOT_VALIDATED) alpha

#### Arguments

- `&lt;type&gt;` (Required): 

#### Options

- `--input &lt;path&gt;`: Input JSON payload file
- `--out &lt;path&gt;`: Output artifact file path
- `--json` (Default: `false`): Output results as JSON
- `--workspace &lt;path&gt;`: Override workspace root directory

---

## `hardkas artifact inspect`

### Synopsis (Generated)

**Purpose:** Deep inspect an artifact by ID or path stable

#### Arguments

- `&lt;id_or_path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output results as JSON
- `--workspace &lt;path&gt;`: Override workspace root directory

---

## `hardkas artifact verify`

### Synopsis (Generated)

**Purpose:** Verify an artifact: integrity (offline, every network), and on request its network level (NETWORK_OBSERVED by a node of its network) and consensus level (CONSENSUS_CONFIRMED by the declared confirmation policy; not finality). Mainnet: offline only stable

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output results as JSON
- `--recursive` (Default: `false`): Recursively verify all artifacts in a directory
- `--strict` (Default: `false`): Perform deep semantic and operational safety verification
- `--network &lt;network&gt;`: Check the artifact's transaction on a node of this network (must be the artifact's own; mainnet is never contacted)
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint for the network check (default: the one the workspace declares for the network; local networks: their local default)
- `--since &lt;blockHash&gt;`: Virtual-chain cursor for the network check: a chain block before the transaction's acceptance (default: the artifact's own submit point, else the node's pruning point)
- `--min-confirmations &lt;n&gt;`: Blue-score depth for CONSENSUS_CONFIRMED (default: the HardKAS product policy, 100)
- `--require &lt;level&gt;`: Level the verification must reach to succeed: integrity (default), network or consensus
- `--workspace &lt;path&gt;`: Override workspace root directory

---

## `hardkas artifact migrate`

### Synopsis (Generated)

**Purpose:** Re-issue a legacy artifact as hashVersion 5 plus a MigrationReceipt (never in place) alpha

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--to &lt;hashVersion&gt;`: Target hash version (only 5 is supported)
- `--migration-id &lt;id&gt;`: Migration identifier recorded in the receipt
- `--json` (Default: `false`): Output results as JSON
- `--workspace &lt;path&gt;`: Override workspace root directory

---

## `hardkas artifact explain`

### Synopsis (Generated)

**Purpose:** Provide a human-readable operational summary of an artifact stable

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON
- `--strict` (Default: `false`): Perform deep semantic and operational safety verification
- `--workspace &lt;path&gt;`: Override workspace root directory

---

## `hardkas artifact lineage`

### Synopsis (Generated)

**Purpose:** Show the provenance and operational history of an artifact stable

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON
- `--workspace &lt;path&gt;`: Override workspace root directory

---

