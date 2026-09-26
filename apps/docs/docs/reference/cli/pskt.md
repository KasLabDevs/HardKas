---
title: hardkas pskt
---

# `hardkas pskt`

## `hardkas pskt capabilities`

### Synopsis (Generated)

**Purpose:** Show PSKT adapter capabilities alpha

#### Options

- `--adapter &lt;adapterId&gt;`: Specific adapter ID to query (default: kaspa-wasm-local)
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas pskt inspect`

### Synopsis (Generated)

**Purpose:** Inspect a PSKT session payload and metadata alpha

#### Arguments

- `&lt;sessionPath&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output results as JSON

---

## `hardkas pskt verify`

### Synopsis (Generated)

**Purpose:** Verify integrity and lineage of a PSKT session alpha

#### Arguments

- `&lt;sessionPath&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output results as JSON

---

## `hardkas pskt export`

### Synopsis (Generated)

**Purpose:** Export a TxPlan as a Portable Signing Session alpha

#### Options

- `--plan &lt;planPath&gt;`: Path to the TxPlan JSON artifact
- `--out &lt;sessionPath&gt;`: Path to write the new PSKT session JSON
- `--adapter &lt;adapterId&gt;`: Specific adapter ID to bind to (default: kaspa-wasm-local)
- `--force` (Default: `false`): Overwrite the output file if it exists
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas pskt import`

### Synopsis (Generated)

**Purpose:** Import a raw payload into a PSKT session alpha

#### Options

- `--file &lt;sessionPath&gt;`: Path to the PSKT session JSON
- `--payload &lt;payloadPath&gt;`: Path to the raw payload file
- `--out &lt;outputPath&gt;`: Path to write the updated PSKT session JSON
- `--force` (Default: `false`): Overwrite the output file if it exists
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas pskt sign`

### Synopsis (Generated)

**Purpose:** Sign a PSKT session payload alpha

#### Arguments

- `&lt;sessionPath&gt;` (Required): 

#### Options

- `--account &lt;name&gt;`: Name of the HardKAS L1 account to sign with
- `--keystore &lt;path&gt;`: Path to a HardKAS keystore JSON file
- `--key-stdin`: Read private key from standard input
- `--private-key-file &lt;path&gt;`: Path to file containing raw private key (TEST ONLY)
- `--out &lt;outputPath&gt;`: Path to write the updated PSKT session JSON
- `--force` (Default: `false`): Overwrite the output file if it exists
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas pskt merge`

### Synopsis (Generated)

**Purpose:** Merge two PSKT sessions alpha

#### Arguments

- `&lt;sessionA&gt;` (Required): 
- `&lt;sessionB&gt;` (Required): 

#### Options

- `--out &lt;outputPath&gt;`: Path to write the merged PSKT session JSON
- `--force` (Default: `false`): Overwrite the output file if it exists
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas pskt finalize`

### Synopsis (Generated)

**Purpose:** Finalize a PSKT session alpha

#### Arguments

- `&lt;sessionPath&gt;` (Required): 

#### Options

- `--out &lt;outputPath&gt;`: Path to write the finalized PSKT session JSON
- `--force` (Default: `false`): Overwrite the output file if it exists
- `--json` (Default: `false`): Output results as JSON

---

## `hardkas pskt extract`

### Synopsis (Generated)

**Purpose:** Extract KaspaRpcTransaction from a finalized PSKT session alpha

#### Arguments

- `&lt;sessionPath&gt;` (Required): 

#### Options

- `--out &lt;outputPath&gt;`: Path to write the Kaspa transaction JSON
- `--force` (Default: `false`): Overwrite the output file if it exists
- `--json` (Default: `false`): Output results as JSON

---

