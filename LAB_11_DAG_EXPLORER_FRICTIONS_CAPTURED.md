# Lab 11 Certificate: DAG Explorer Frictions Captured

This certifies that **Lab 11: DAG Explorer / Conflict Viewer** has been successfully constructed, validating the severe frictions developers face when working with raw blocks on the Kaspa DAG.

## Validated Frictions

1. **Parent/Child Resolution**: Bidirectional relationships are missing; finding children requires full O(N) database scans.
2. **Recursive Blue Score**: Calculating the `blueScore` of a block requires a highly inefficient recursive traversal of the entire DAG up to Genesis.
3. **Confirmations Calculation**: Lacking a "Virtual Block" primitive, calculating confirmations forces the developer to manually find all tips, resolve the heaviest, and perform Deep First Search (`isAncestorOf`) to validate reachability.
4. **Reachability**: DFS/BFS in user-land is error-prone and duplicates core logic.
5. **Orphan Detection**: Requires redundant querying of all parent existence.
6. **Transaction Tracing**: Hard to distinguish between a transaction merged on multiple branches versus an active double-spend conflict without manual parallel-branch detection.

## Implementation Details
- **Architecture**: Fastify REST API, manual `DAGService`, manual `TraceService`, and an in-memory `ExplorerStore`.
- **Data Source**: Synthetic static fixture mimicking complex DAG topologies (merges, parallel branches, orphans, transaction conflicts).
- **Test Coverage**: Topologies successfully tested via `vitest`.
- **Documentation**: All pain points formally extracted to `FRICTIONS.md`.

**Status**: READY FOR P45.1 (DAG Toolkit Phase 1A).
