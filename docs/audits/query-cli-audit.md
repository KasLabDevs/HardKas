# HardKas Query CLI Audit

## 1. Scope
This audit inspects the command-line interface (CLI) layer of the HardKas Query Engine. It evaluates:
- Coverage of commands registered under `hardkas query`.
- Consistency in the use of the `QueryRequest` → `execute()` → `serializeQueryResult()` pipeline.
- Real integration with adapters and the persistence backend (SQLite/FS).
- Quality and readability of terminal visualizers.
- Management of output modes (JSON, Explain, Why).
- Security and performance risks from a user input perspective.

## 2. Executive Summary
The HardKas Query CLI presents a very mature and consistent command architecture, following a strict decoupling pattern between the UI and the execution engine. However, critical "ghost code" errors (references to non-existent functions) and omissions in exposing engine capabilities have been detected.

**Status by Domain:**
- **Artifacts**: **STABLE**. Great coverage, though CLI exposition of `verify` is missing.
- **Lineage**: **PARTIAL**. Full wiring, basic but effective graph visualization.
- **Replay**: **PARTIAL**. Functional divergence system, but limited to manual inspection.
- **DAG**: **EXPERIMENTAL**. Light model clearly flagged as "not-consensus".
- **Events**: **STABLE**. Deterministic filtering over persistent logs.
- **TX Aggregation**: **STABLE**. The crown jewel of operational introspection.

| Factor | Status | Notes |
| :--- | :--- | :--- |
| Command Coverage | **PARTIAL** | `artifacts verify` and `store sync` missing. |
| Wiring Consistency | **GOOD** | Uniform use of `createQueryRequest` and `execute`. |
| Error Handling | **WEAK** | Presence of reference bugs in diagnostic visualizers. |
| User Experience | **GOOD** | Rich visual feedback and maturity signaling (stable/preview/research). |

## 3. Query Command Inventory

| Command | Status | Maturity Tag | Wiring |
| :--- | :--- | :--- | :--- |
| `query artifacts list` | **STABLE** | stable | FULL |
| `query artifacts inspect` | **STABLE** | stable | FULL |
| `query artifacts diff` | **STABLE** | stable | FULL |
| `query lineage chain` | **PARTIAL** | preview | FULL |
| `query lineage transitions`| **PARTIAL** | preview | FULL |
| `query lineage orphans` | **PARTIAL** | preview | FULL |
| `query replay list` | **PARTIAL** | preview | FULL |
| `query replay summary` | **PARTIAL** | preview | FULL |
| `query replay divergences` | **EXPERIMENTAL** | preview | FULL |
| `query dag conflicts` | **EXPERIMENTAL** | research | FULL |
| `query dag history` | **EXPERIMENTAL** | research | FULL |
| `query events` | **STABLE** | stable | FULL |
| `query tx <id>` | **STABLE** | stable | FULL |
| `query store doctor` | **STABLE** | alpha | FULL |
| `query store rebuild` | **STABLE** | alpha | FULL |

## 4. CLI Wiring
Wiring follows a deferred dependency injection pattern via `getQueryEngine()`.

- **Factory Pattern**: `getQueryEngine` (line 863) attempts to connect to SQLite and performs an automatic `indexer.sync()`. If it fails, it falls back to the `FilesystemQueryBackend`.
- **Request Builder**: Systematic use of `createQueryRequest` from `@hardkas/query`.
- **Execution**: Asynchronous calls to `engine.execute(request)`.
- **Output selection**: Clear bifurcation between `serializeQueryResult(result)` (JSON) and specific printing functions (`printX`).

## 5. Artifacts Query Audit
- **Findings**: The `list` command supports a wide range of filters (`--schema`, `--network`, `--mode`, etc.).
- **Missing**: The adapter supports the `verify` operation (integrity + semantics), but the CLI does not expose it.
- **Explain Gap**: Unlike other domains, `artifacts` does not support the `--why` shorthand.

## 6. Lineage Query Audit
- **Findings**: Excellent graph navigation support (`chain` with `--direction`).
- **Orphans**: Very useful for detecting file system desynchronizations.
- **Visualization**: The `printLineageChain` visualizer uses ASCII characters to represent hierarchy.

## 7. Replay Query Audit
- **Findings**: Integrates receipts (`receipts`) and traces (`traces`).
- **Divergences**: Detects state discrepancies.
- **Wiring**: Correctly connected with the replay adapter.

## 8. DAG Query Audit
- **Warning Compliance**: All DAG commands correctly print the warning: `⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)`.
- **Operations**: Full coverage of simulator capabilities (conflicts, displaced, sink-path, anomalies).

## 9. Events Query Audit
- **Findings**: Flexible filtering by domain, type, and workflow.
- **Consistency**: Uses the same rendering engine as other lists.

## 10. TX Aggregation Audit
- **Findings**: Aggregates artifacts and events under a single causal view.
- **Integrity**: The `complete` field indicates whether the life cycle (plan -> signed -> receipt) is closed.

## 11. Output Modes
- **--json**: Implemented in all commands using `serializeQueryResult`. Deterministic and consistent.
- **--explain**: Exposes execution metadata (backend, time, rows read).
- **--why**: Shorthand for `--explain full`, injects the `WhyBlock` (causal analysis).

## 12. Backend / Store Integration
- **Auto-Sync**: An architectural success. `getQueryEngine` synchronizes the SQLite Store on every query, maintaining "freshness" without user intervention.
- **Fallback**: If the database is corrupt or locked, the CLI gracefully falls back to file system scans.

## 13. Performance Review
- **Bottleneck**: Adapters are filtering in memory after requesting all data from the backend. For thousands of artifacts, the CLI will experience significant latency.
- **Index Usage**: The CLI reports `indexesUsed` in the `explain` block, but it is currently declarative rather than real SQL engine diagnostic information.

## 14. Security Review
- **Path Traversal**: Artifact paths are cleaned and validated before reading.
- **SQL Injection**: No exposure of raw SQL to the user. All parameters travel via `QueryRequest` and are sanitized by the backend.
- **Secret Leakage**: The `explain` block and JSON dump could leak absolute paths from the developer's system (`filePath`).

## 15. Findings

### CRITICAL: Ghost Code / Runtime Error
In the functions `printTxAggregate` (line 857) and `printDagAnomalies` (line 777), `printExplainChains(result.explain)` is called. This function **DOES NOT EXIST** in the file. The correct function is `printExplain`.
> [!CAUTION]
> Running these commands with `--explain` will cause a CLI crash (`ReferenceError: printExplainChains is not defined`).

### MISSING: Store Index/Sync
The `doctor` command suggests running `hardkas query store index` to populate the DB, but that command is not registered in `storeCmd`. Only `doctor` and `rebuild` exist.

### INCONSISTENCY: Artifacts --why
The `artifacts` subcommand is the only one that hasn't adopted the `--why` shorthand, requiring `--explain full`.

## 16. Recommendations

### P0 — Fix Reference Errors
- Correct the calls to `printExplainChains` to `printExplain` to avoid production crashes.

### P1 — UI Consistency
- Add the `artifacts verify` subcommand to the CLI.
- Add the `--why` shorthand to the `artifacts` command.
- Register `query store sync` as an alias for a manual synchronization process.

### P2 — Performance Hardening
- Implement "Push-down filtering": pass CLI filters to the SQLite backend to avoid massive data transfers between processes.

## 17. Tests Recommended
- **CLI Integration Test**: Run every subcommand with `--explain` to ensure no more orphaned references.
- **JSON Consistency Test**: Validate that `--json` output is identical when running the query against the SQLite backend and the filesystem fallback.
- **Path Escape Test**: Attempt to access files outside `.hardkas` via `inspect`.

## 18. Final Assessment
The CLI is **ROBUST** in its conception but **FRAGMENTED** in its final polish. The "QueryEngine as a Service" architecture is brilliant and facilitates extensibility, but reference errors in visualizers and the lack of some key commands indicate the final integration was rushed. Once the reference errors (P0) are corrected, the system will be ready for intensive developer use.

## 19. Checklist
- [x] artifacts list audited
- [x] artifacts inspect audited
- [x] lineage chain audited
- [x] replay divergences audited
- [x] dag conflicts audited
- [x] events audited
- [x] tx aggregation audited
- [x] No modifications to runtime logic.
- [x] No modifications to CLI commands.

## 20. Guardrails
- Runtime logic was not modified.
- QueryStore was not modified.
- QueryEngine was not modified.
- Schemas were not modified.
- This audit is purely documentary and technical.
