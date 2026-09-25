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
- **Accepted Identifiers:** `explicit filepath`, `exact canonical artifactId`, `planId (legacy compatibility)`
- **Evidence Semantics:** Produces a human-readable trace of the artifact's lineage and assertions.

#### Known Limitations
- Does NOT accept `txId` or `contentHash` as generic locators.

#### Related
- Guide: /how-to/verify-evidence.md

---

