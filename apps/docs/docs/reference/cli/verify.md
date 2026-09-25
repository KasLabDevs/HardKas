---
title: hardkas verify
---

# `hardkas verify`

## `hardkas verify`

### Synopsis (Generated)

**Purpose:** Verify artifact integrity and lineage continuity across the workspace stable

#### Arguments

- `[path]` (Optional): Workspace-contained artifact file or directory to verify (default: .hardkas/artifacts)

#### Options

- `--json` (Default: `false`): Output machine-readable JSON

### Semantic Contract (Curated)

- **Environments:** Local Workspace
- **Reads:** All JSON artifacts in .hardkas/artifacts/, Or the workspace-contained file/directory given as [path]
- **Writes:** 
- **Produces:** 
- **Accepted identifiers:** (none) → every artifact under .hardkas/artifacts/, explicit workspace-contained filepath, explicit workspace-contained directory
- **Evidence Semantics:** Verifies cryptographic integrity (contentHash recomputed under the declared hashVersion), schema compliance, references and DAG continuity, always in strict mode. `ok` in the JSON envelope is the verdict and a failed verdict exits non-zero.
- **Limitations:**
  - Always strict: an artifact with hashVersion ≤ 4 fails with MIGRATION_REQUIRED; re-issue it with `hardkas artifact migrate <path> --to 5`.
  - A [path] outside the workspace is refused (ARTIFACT_PATH_OUTSIDE_WORKSPACE); excess positional arguments are a usage error.
  - No consensus replay is performed; the former deep-validation flag was removed because it performed no check.

#### Related
- Concept: /concepts/evidence.md
- Guide: /how-to/verify-evidence.md

---

