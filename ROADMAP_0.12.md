# HardKAS 0.12.x Roadmap: Production-Grade Runtime

The 0.11.x series successfully delivered the **first complete public alpha runtime** for Kaspa applications. It introduced a unified architecture of Toolkits (Wallet, Payment, Indexer, DAG, Jobs, Snapshots), native `bigint` safety, and backend plugins for real Docker validation.

The primary directive for the 0.12.x series is strict: **Do not expand the surface area first. Instead, make the 0.11 runtime production-grade.**

We now have a real, public release to iterate upon. The goal of 0.12 is to ensure that the applications built on top of HardKAS can survive real-world scale, long-running deployments, and network instability.

---

## 0.12.x Priorities

### 1. Production Backends (SQLite & Postgres)
The current `QueryStore` and `DomainStore` implementations are robust but heavily rely on memory and JSON.
- **P56 — SQL Toolkit Store Adapters**: Implement official SQLite and PostgreSQL adapters for `IndexerToolkit`, `JobsToolkit`, and `PaymentToolkit`.
- Ensure deterministic evidence generation still functions identically over a SQL backing.

### 2. RPC Resilience (Retry & Connection Pooling)
The `kaspaRpcBackendPlugin` (V1) works but is brittle under heavy concurrent loads or network drops.
- **P57 — RPC Hardening**: Implement robust connection pooling, automatic retries with exponential backoff, and WebSocket reconnection jitter.
- The SDK facade must remain completely insulated from RPC failures.

### 3. Sync Daemon
Applications currently block or rely on manual polling logic to track the DAG.
- **P58 — HardKAS Sync Daemon**: Introduce a background daemon capable of maintaining an active, synchronized replica of necessary DAG state.
- Will emit deterministic events for application consumption without locking the main runtime loop.

### 4. Long-Run Docker Stability
- **P59 — Continuous Stability Gauntlets**: Extend the current CI to include 48-hour continuous stress tests against real Docker `kaspad` instances to guarantee zero memory leaks and stable IPC performance.

### 5. Silver Real Backend Path
- **P60 — Silver Network Bridging**: Transition the Silver Toolkit from simulation-only to supporting real RPC backend translation (where the Kaspa network permits).

### 6. Advanced L2 Labs (Later in 0.12)
Once the base runtime is strictly production-grade, we will explore:
- HardKAS as an L2 sequencer simulator.
- Cross-toolkit rollup simulations.

---

## The Golden Rule of 0.12
**Applications define the SDK. The SDK never defines applications.**

Every new production adapter or daemon feature must be driven by a real-world friction point discovered while building the baseline Builder Labs (Wallet Backend, Merchant Checkout, Local Indexer).
