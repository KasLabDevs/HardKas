# HardKAS Simulation Model

HardKAS utilizes a **deterministic light-model simulation** for local development. It is a deterministic workflow environment designed to provide a productive, low-latency environment for developers while maintaining operational consistency with the observable behaviors of the Kaspa BlockDAG.

## Core Architecture

HardKAS does **not** run a full Kaspa consensus engine in simulated mode. Instead, it implements a set of deterministic rules and state transitions that mirror the observable behavior of the Kaspa network.

### 1. State Management
- **UTXO Set**: HardKAS maintains a persistent UTXO (Unspent Transaction Output) set in `.hardkas/localnet.json`.
- **Balances**: Address balances are derived from the current UTXO set.
- **Persistence**: All state changes are flushed to disk atomically, allowing the development environment to survive restarts.

### 2. Transaction Lifecycle
1. **Planning**: Transactions are planned based on the current simulated UTXO set and fee estimations.
2. **Execution**: Simulated transactions are processed instantly. UTXOs are consumed and created according to standard Kaspa rules.
3. **Traceability**: Every transaction generates a detailed execution trace and receipt for debugging.

### 3. BlockDAG Simulation (Light-Model)
HardKAS v0.2-alpha introduces a **Light BlockDAG Simulation** to model basic DAG operations:
- **Blocks**: Transactions are grouped into virtual "blocks" in the simulated DAG.
- **Parents/Children**: Blocks maintain parent-child relationships, forming a DAG structure.
- **Selected Path**: The simulator maintains a "selected path" (canonical chain) based on GHOSTDAG-like heuristics (simplified).
- **Sink**: The latest block on the selected path.
- **Reorgs**: Developers can trigger simulated "reorgs" to test how their applications handle path switching and transaction displacement.

## Key Differences from Real kaspad

| Feature | HardKAS Simulated | Real Kaspa Node |
|---------|-------------------|-----------------|
| **Confirmation** | Instant (Simulated) | DAA/Consensus-driven |
| **Consensus** | Deterministic Light-Model | Full GHOSTDAG / PoW |
| **Mining** | None (Virtual) | Real PoW (k-heavyhash) |
| **Networking** | Local-only | Peer-to-peer (P2P) |
| **Finality** | Immediate (Simulated) | Probabilistic / Blue Score |

## Operational Guardrails

To ensure safety and reliability, HardKAS enforces strict boundaries between simulation and reality:
- **Account Isolation**: Accounts are resolved within the context of the active environment.
- **Signing Rails**: Simulated transactions cannot be signed with real accounts unless explicitly configured for hybrid testing.
- **Mainnet Protection**: All mainnet-bound operations are blocked by default in v0.2-alpha.

## When to use Simulated Mode
- Initial application development and UI prototyping.
- Automated testing and CI/CD pipelines.
- Debugging transaction logic and edge cases (e.g., reorg handling).

## When to use Node Mode
- Final integration testing before mainnet deployment.
- Verifying exact transaction mass and fee calculations.
- Testing P2P interaction and real network latency.
