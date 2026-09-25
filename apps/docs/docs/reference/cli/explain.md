---
title: hardkas explain
---

# `hardkas explain`

## `hardkas explain`

### Synopsis (Generated)

**Purpose:** Provide a narrative causal explanation of an artifact resolved by exact artifactId or artifact file path stable

#### Arguments

- `&lt;artifact&gt;` (Required): 

#### Options

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

