# HardKAS Release Contract

This document formally specifies the release guarantees and API contract points for HardKAS integrations (CLI, CI/CD, and Agent Orchestrators).

## 1. Supported Environments

HardKAS makes the following OS/Runtime assumptions:

- **Runtime**: Node.js >= 18 (Strictly verified).
- **Package Manager**: pnpm (Recommended) or npm/yarn.
- **Operating Systems**: Windows, Linux, macOS (Posix and Windows paths are normalized deterministically internally).
- **Filesystem**: Assumes reliable filesystem flushes. Watchers (like `chokidar` for `fs.watch`) are **optimization hints only**. They are never relied upon for state correctness.

## 2. API & Exit Code Guarantees

All HardKAS CLI executions map directly to programmatic exit codes to facilitate robust integration.

| Exit Code | Semantic Meaning                 | Description                                                                                                  |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `0`       | **Success**                      | The operation completed successfully without violating any policies.                                         |
| `1`       | **Runtime / Validation Failure** | A generic execution error, network failure, or invalid payload schema occurred.                              |
| `2`       | **Usage Error**                  | Invalid CLI flags, missing arguments, or malformed input structures.                                         |
| `3`       | **Policy Denied**                | The action was intentionally blocked by the HardKAS policy engine (e.g., attempting mutations in a dry-run). |
| `4`       | **Corruption Detected**          | Verification processes detected a broken cryptographic signature or missing causal lineage.                  |

## 3. Data Formatting Guarantees

When appending `--json` to any command:

1. All `stdout` output is strictly valid JSON data. No logs or formatting artifacts will pollute this stream.
2. All human-readable logs, warnings, and UI spinners are piped exclusively to `stderr`.
3. The output JSON structures guarantee **deterministic key sorting**. If identical payloads are generated, their structural layout will be string-identical across varying architectures.

## 4. Crash Consistency & Projection Recoverability

HardKAS guarantees absolute crash consistency against its query engine.

- **SQLite/query-store** is explicitly designated as **disposable projection state**.
- If the SQLite database `.hardkas/store.db` is corrupted, deleted, or missing, it can always be recovered with mathematically verifiable precision using `hardkas rebuild --from-artifacts`.
- Operations that execute mutating logic do so by creating append-only JSON files, which act as the absolute source of canonical authority.

## 5. Compatibility Guarantees

- Artifact schema versions (`v1`) are strictly typed.
- Any future modifications to the artifact schemas will require explicit migration logic and bump the schema version. Upwards compatibility is preserved for historical artifacts.
