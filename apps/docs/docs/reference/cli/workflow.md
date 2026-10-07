---
title: hardkas workflow
---

# `hardkas workflow`

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

## `hardkas workflow diff`

### Synopsis (Generated)

**Purpose:** Compare two workflow artifacts structurally

#### Arguments

- `&lt;a&gt;` (Required): 
- `&lt;b&gt;` (Required): 

---

