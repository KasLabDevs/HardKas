---
title: hardkas artifact
---

# `hardkas artifact`

## `hardkas artifact create`

### Synopsis (Generated)

**Purpose:** Create a new HardKAS artifact alpha

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

**Purpose:** Verify an artifact's integrity and schema stable

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output results as JSON
- `--recursive` (Default: `false`): Recursively verify all artifacts in a directory
- `--strict` (Default: `false`): Perform deep semantic and operational safety verification
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

