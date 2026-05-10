# HardKAS Simulation Model

This document outlines the scope, goals, and limitations of the HardKAS BlockDAG simulation environment.

## 1. Philosophical Scope

The HardKAS simulation is designed as a **developer-centric operating environment**, not a consensus research tool. Its primary goal is to provide a deterministic, zero-latency feedback loop for developing and testing Kaspa-native applications.

> [!IMPORTANT]
> **Not a full GHOSTDAG implementation.**
> HardKAS does not simulate the full GHOSTDAG consensus protocol, k-parent selection, or complex ghost-parent voting. It approximates DAG behavior to model transaction conflicts and reorgs for developer workflows.

## 2. Model Capabilities

### Deterministic DAG Structure
- Blocks are created with explicit parent-child relationships.
- Every simulation state is reproducible from its genesis block and transaction sequence.

### Sink Movement & Recomputation
- The "Sink" represents the current latest block in the simulation.
- Moving the sink triggers a recomputation of the "Selected Path" and the set of accepted transactions.

### Transaction Displacement
- If a new block is added that spends an outpoint already spent in a competing parallel branch, the simulation resolves the conflict deterministically.
- Displacement occurs when a transaction that was previously "accepted" becomes "displaced" because its inputs are now spent by a higher-priority block in the new selected path.

### Conflict Resolution Rules
For v0.2-alpha, conflicts are resolved using these prioritized rules:
1. **Sink Ancestry**: Blocks in the selected path to the sink have absolute priority.
2. **Deterministic Order**: Tie-break by DAA score (approximation) and then Block ID lexicographically.
3. **Transaction ID**: Final tie-break by TxID lexicographical order.

## 3. Intended Use Cases

- **Integration Testing**: Verify how your app handles transaction failures due to double-spends.
- **UI/UX Development**: Build interfaces that react to transaction "displacement" (reorg-like behavior).
- **Educational Tooling**: Visualize basic BlockDAG concepts without the complexity of a full live node.

## 4. Non-Goals (Out of Scope)

- **Mining Simulation**: No Proof-of-Work or hash-rate modeling.
- **P2P Networking**: No protocol-level gossip or block propagation delays.
- **Consensus Research**: Not intended for validating GHOSTDAG security parameters or performance.
- **Production Custody**: NEVER use simulation-mode accounts for real mainnet funds.

## 5. Summary of Operational Behavior

| Feature | HardKAS Simulation | Real Kaspa (GHOSTDAG) |
| :--- | :--- | :--- |
| **Topology** | Manual/Programmatic DAG | Dynamic P2P DAG |
| **Selection** | Rule-based (Sink Ancestry) | Weighted GHOSTDAG |
| **Conflicts** | Deterministic resolution | Consensus-driven resolution |
| **Latency** | Zero (Instant) | Network-dependent |
| **Persistence** | Local JSON state | Global distributed ledger |
