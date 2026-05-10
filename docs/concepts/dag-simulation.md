# DAG Simulation (Light-Model)

HardKAS includes a **Light-Model DAG Simulator** designed for local development and CI testing. It is important to understand its purpose and its limitations.

## What it IS
- **Deterministic**: The simulator uses a lexicographic tie-breaking rule and a fixed `DAA score` progression to ensure that reorgs and merges are 100% reproducible.
- **Local-First**: It allows you to test reorg handling, transaction displacement, and conflict resolution without running a full Kaspa node.
- **Fast**: Simulation state transitions happen in milliseconds.

## What it IS NOT
- **A Consensus Implementation**: The simulator does not run GHOSTDAG. It does not calculate real blue scores or maintain a real BlockDAG graph.
- **Protocol Parity**: It is a *simulation* of BlockDAG behaviors, not a replacement for testing against a real `kaspad` node.

## Key Concepts

### The Sink
The `sink` represents the current "tip" of the DAG from the simulator's perspective. Transactions are "accepted" if they are in the past of the sink and don't conflict with other accepted transactions.

### Displaced Transactions
If a simulated reorg occurs (e.g., the sink moves from Branch A to Branch B), some transactions that were previously "accepted" may be "displaced" if they are not in the past of the new sink. HardKAS allows you to verify how your application handles these state shifts.

### Deterministic Merges
When merging two branches, the simulator follows a predictable path selection. This ensures that if you share a `snapshot` and a `dag-op` artifact with another developer, they will see the exact same merge outcome.

## When to use Simulation vs. Real Node

| Feature | Simulator | Real Node (`simnet`) |
| :--- | :--- | :--- |
| **Transaction Planning** | Ideal | Required for final check |
| **Reorg Handling Logic** | Best (Deterministic) | Hard to trigger |
| **Network Latency Testing** | N/A | Best |
| **Mining/Consensus Debugging** | N/A | Best |

By using the simulator for logic verification and the real node for integration testing, you achieve the best balance of speed and confidence.
