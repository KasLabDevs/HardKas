# Architecture: Artifacts vs. Projection

HardKAS introduces a fundamental architectural split between **Canonical Truth** and **Derived State**.

## The Old Way

In traditional web3 development, the developer's local node (e.g., Anvil, Hardhat Network) acts as the single source of truth. If the node's database is corrupted, or the node is restarted without state persistence, all developer history is lost. 

## The HardKAS Way

HardKAS adopts an event-sourcing model where local files are the primary database.

### 1. Artifacts (Canonical Truth)
Every interaction with the blockchain is saved as a JSON artifact in the `.hardkas/artifacts` folder.
- **Immutable**: Once written, artifacts are never modified.
- **Causal**: Artifacts reference their parents, forming a deterministic DAG (Directed Acyclic Graph).
- **Verifiable**: Every artifact can be hashed and verified.

If your database is destroyed, you lose nothing, because the artifacts remain safe on your disk.

### 2. Projections (Derived State)
The local SQLite database (Query Store) is merely a **projection** of the artifact lattice.
The HardKAS Dev Server watches the artifact folder and continuously projects new artifacts into indexed database tables for fast querying (e.g., fetching account balances, listing transactions).

### Resilience in Action

If the projection is corrupted (simulated via `hardkas sandbox --recipe projection-rebuild`), the dashboard warns you, but you haven't lost your history. You simply drop the database and rebuild it from the artifact folder:

```bash
hardkas rebuild
```

This strict separation guarantees that developer workflows are resilient, observable, and strictly reproducible.
