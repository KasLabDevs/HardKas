---
title: hardkas explain
---

# `hardkas explain`

## `hardkas explain`

### Synopsis (Generated)

**Purpose:** Provide a narrative causal explanation of an artifact resolved by exact artifactId, artifact file path, or a namespaced identifier (--plan, --signed, --tx, --workflow) stable

#### Arguments

- `&lt;artifact&gt;` (Optional): 

#### Options

- `--artifact &lt;id-or-path&gt;`: 64-hex artifactId or workspace path (same as the positional)
- `--plan &lt;planId&gt;`: Resolve a plan by its derived label (verified against its hash)
- `--signed &lt;signedId&gt;`: Resolve a signed transaction by its derived label (verified)
- `--tx &lt;txId&gt;`: Resolve the submission receipt for a txId (never the signed)
- `--workflow &lt;workflowId&gt;`: Resolve a workflow run by its correlation id
- `--workspace &lt;path&gt;`: Override workspace root directory

### Semantic Contract (Curated)

- **Environments:** Local Workspace
- **Reads:** Artifact JSON file, Parent artifacts in lineage
- **Writes:** 
- **Produces:** 
- **Accepted Identifiers:** `explicit filepath`, `exact canonical artifactId`, `--plan <planId>`, `--signed <signedId>`, `--tx <txId>`, `--workflow <workflowId>`
- **Evidence Semantics:** Produces a human-readable trace of the artifact's lineage and assertions.

#### Known Limitations
- A bare label, txId or workflowId is refused with NAMESPACE_REQUIRED; name its namespace flag. The `--tx` namespace returns the submission receipt, never the signed transaction.

#### Related
- Guide: /how-to/verify-evidence.md

---

