---
title: hardkas workflow
---

# `hardkas workflow`

## `hardkas workflow create`

### Synopsis (Generated)

**Purpose:** Create a deterministic workflow from a template

#### Arguments

- `&lt;name&gt;` (Required): 

#### Options

- `--template &lt;name&gt;`: Embedded template name
- `--out &lt;path&gt;`: Output artifact file path
- `--json` (Default: `false`): Output the final workflow artifact as JSON
- `--workspace &lt;path&gt;`: Override workspace root directory

---

## `hardkas workflow run`

### Synopsis (Generated)

**Purpose:** Execute a workflow JSON definition in Agent mode

#### Arguments

- `&lt;file&gt;` (Required): 

#### Options

- `--dry-run` (Default: `false`): Simulate the workflow without mutating the filesystem
- `--network &lt;net&gt;`: Target network (e.g. simulated, testnet-10, mainnet)
- `--offline` (Default: `false`): Force offline execution (rejects real RPC connections)
- `--timeout &lt;ms&gt;`: Maximum execution time in milliseconds
- `--json` (Default: `false`): Output the final workflow artifact as JSON

---

## `hardkas workflow inspect`

### Synopsis (Generated)

**Purpose:** Inspect a completed workflow artifact

#### Arguments

- `&lt;id&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output full artifact as JSON

---

## `hardkas workflow replay`

### Synopsis (Generated)

**Purpose:** Deterministically replay and verify a workflow's lineage

#### Arguments

- `&lt;id&gt;` (Required): 

---

## `hardkas workflow diff`

### Synopsis (Generated)

**Purpose:** Compare two workflow artifacts structurally

#### Arguments

- `&lt;a&gt;` (Required): 
- `&lt;b&gt;` (Required): 

---

