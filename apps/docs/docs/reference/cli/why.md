---
title: hardkas why
---

# `hardkas why`

## `hardkas why`

### Synopsis (Generated)

**Purpose:** Explain the causal lineage of an artifact resolved by exact artifactId, artifact file path, or a namespaced identifier (--plan, --signed, --tx, --workflow)

#### Arguments

- `&lt;artifact&gt;` (Optional): Exact 64-hex artifactId (the recomputed contentHash) or absolute/workspace-relative path to the artifact .json file

#### Options

- `--artifact &lt;id-or-path&gt;`: 64-hex artifactId or workspace path (same as the positional)
- `--plan &lt;planId&gt;`: Resolve a plan by its derived label (verified against its hash)
- `--signed &lt;signedId&gt;`: Resolve a signed transaction by its derived label (verified)
- `--tx &lt;txId&gt;`: Resolve the submission receipt for a txId (never the signed)
- `--workflow &lt;workflowId&gt;`: Resolve a workflow run by its correlation id
- `--json`: Output lineage graph in JSON format
- `--workspace &lt;path&gt;`: Override workspace root directory

### Semantic Contract (Curated)

- **Environments:** Local Workspace
- **Reads:** Artifact JSON file, Parent artifacts in lineage
- **Writes:** 
- **Produces:** 
- **Accepted Identifiers:** `explicit filepath`, `exact canonical artifactId`, `--plan <planId>`, `--signed <signedId>`, `--tx <txId>`, `--workflow <workflowId>`
- **Evidence Semantics:** Extended causal tracing. Identical constraints to `explain`.

#### Known Limitations
- A bare label, txId or workflowId is refused with NAMESPACE_REQUIRED; name its namespace flag. The `--tx` namespace returns the submission receipt, never the signed transaction.

---

