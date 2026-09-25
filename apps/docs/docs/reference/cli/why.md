---
title: hardkas why
---

# `hardkas why`

## `hardkas why`

### Synopsis (Generated)

**Purpose:** Explain the causal lineage of an artifact resolved by exact artifactId or artifact file path

#### Arguments

- `&lt;artifact&gt;` (Required): Exact 64-hex artifactId (lineage.artifactId) or absolute/workspace-relative path to the artifact .json file

#### Options

- `--json`: Output lineage graph in JSON format
- `--workspace &lt;path&gt;`: Override workspace root directory

### Semantic Contract (Curated)

- **Environments:** Local Workspace
- **Reads:** Artifact JSON file, Parent artifacts in lineage
- **Writes:** 
- **Produces:** 
- **Accepted Identifiers:** `explicit filepath`, `exact canonical artifactId`, `planId (legacy compatibility)`
- **Evidence Semantics:** Extended causal tracing. Identical constraints to `explain`.

---

