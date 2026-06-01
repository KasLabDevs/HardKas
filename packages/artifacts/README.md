# `@hardkas/artifacts`

The Artifacts engine is the cryptographic heart of HardKAS. It ensures that every plan, signature, and transaction receipt is content-addressed, deterministic, and immutable.

## 1. Deterministic Hashing Pipeline

HardKAS does not hash raw JSON strings. It hashes the *semantic meaning* of an artifact. Two artifacts generated on different OS platforms, or with different `hardkasVersion` metadata, must hash to the exact same `contentHash`.

### Flow: Canonicalization
1. **Semantic Exclusion:** Metadata fields (like `createdAt`, `hardkasVersion`, `os`) are aggressively stripped from the payload.
2. **Key Sorting:** Object keys are sorted recursively.
   - **CRITICAL INVARIANT:** Sorting must use strict byte-level comparison. `localeCompare` is explicitly forbidden to prevent cross-platform determinism failures.
3. **Data Types:** `BigInt` values are explicitly serialized to base-10 strings to prevent JSON truncation.
4. **Unicode Normalization:** All string values are normalized using NFC.
5. **Hashing:** The canonical JSON string is passed through SHA-256.

## 2. Path Traversal & Workspace Boundaries

HardKAS operates strictly within the `.hardkas/` directory.

### Flow: Secure Read/Write
Any read or write to the artifact store (`.hardkas/artifacts/`) passes through a strict path normalizer:
1. The requested path is resolved using `path.resolve()`.
2. The engine verifies that the resolved path begins exactly with the absolute path of `.hardkas/artifacts/`.

### Variant: Traversal Attempt
If an artifact reference attempts to break out of the workspace (e.g., `../../../etc/passwd`):
1. The verification engine throws a `PATH_TRAVERSAL_ATTEMPT` exception.
2. The violation is logged securely without leaking the underlying system path.
3. The artifact read is hard-aborted.

## 3. Lineage Verification (Replay Engine)

Artifacts form a cryptographic Directed Acyclic Graph (DAG) via a `causationId` field.

### Flow: Strict Verification (`--strict`)
When running `hardkas verify --strict`:
1. Every artifact in `.hardkas/artifacts/` is loaded into memory.
2. Its canonical hash is recalculated and compared against its filename.
3. The engine follows the `causationId` pointers: `Receipt` -> `SignedTx` -> `TxPlan`.
4. If a parent artifact is missing, or its hash has changed, the verification immediately fails with `LINEAGE_BROKEN`.

### Variant: Relaxed Verification
When querying artifacts interactively (e.g., `hardkas query artifacts list`), the engine skips full lineage recalculation for speed, relying on SQLite indexing. If a discrepancy is found later, the `Query Store` will flag the artifact as `ORPHANED` rather than halting the entire workspace.
