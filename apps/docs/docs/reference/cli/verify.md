---
title: hardkas verify
---

# `hardkas verify`

## `hardkas verify`

### Synopsis (Generated)

**Purpose:** Verify artifact integrity and lineage continuity across the workspace stable

#### Options

- `--deep` (Default: `false`): Perform a deep validation of signatures and causality
- `--json` (Default: `false`): Output machine-readable JSON

### Semantic Contract (Curated)

- **Environments:** Local Workspace
- **Reads:** All JSON artifacts in .hardkas/artifacts/
- **Writes:** 
- **Produces:** 
- **Evidence Semantics:** Verifies cryptographic integrity (contentHash), schema compliance, and DAG continuity of all artifacts in the workspace. Will attempt deterministic replay audit only in single-file mode if supported.

#### Related
- Concept: /concepts/evidence.md
- Guide: /how-to/verify-evidence.md

---

