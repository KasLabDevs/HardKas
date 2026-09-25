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

### Semantic Contract (Curated)

- **Reads:** the source artifact (any hashVersion ≤ 4), verified under the version it declares
- **Writes:** a NEW version-5 artifact and a `hardkas.migrationReceipt.v1` into `.hardkas/artifacts/`
- **Evidence Semantics:** the re-issued artifact is a child of the verified source (`lineage.parentArtifactId` = the source's recomputed hash). Material fields the source's hash version never authenticated are NOT re-issued as authenticated content: they are recorded under `legacyClaims` as an unverified legacy claim. When such a field is required by the schema, the migration is refused (`MIGRATION_UNVERIFIED_REQUIRED_FIELDS`).
- **Limitations:** the source file is never modified; only `--to 5` is supported; an artifact already at hashVersion 5 is refused (`MIGRATION_NOT_NEEDED`).

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

