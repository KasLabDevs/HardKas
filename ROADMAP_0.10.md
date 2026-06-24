# HardKAS 0.10.x Roadmap & Issue Tracker

The 0.9.7-alpha release boundary established a hardened, deterministic, reproducible local-first runtime. 
Development for 0.10.x will strictly focus on developer experience (DX), introspection, and observability of the hardened runtime, and explicitly *not* on new network claims until the foundation is proven via extensive local usage.

## Epics

### 1. Dev Server & Dashboard [0.10]
- Expand the local dev server capabilities to support a robust visual dashboard.
- Provide real-time streaming of events and metrics from the `LocalnetState`.
- Ensure low-latency visual updates for transaction cycles.

### 2. Artifact Explorer [0.10]
- Build a visual tool to introspect the `.hardkas/artifacts` directory.
- Graph causal lineages between events, transactions, and capabilities.
- Detect and visualize deterministic divergences (e.g. from `replay diff`).

### 3. Programmability Inspectors [0.10]
- Visual tools for inspecting `vProgs` and zero-knowledge (ZK) capability artifacts.
- Debug interfaces for contract simulations.
- Surface deep context around `hardkas.programmability.v1` schema compliance.

### 4. Testnet Preparation (Deferred/Later Phase)
- Build out the strict constraints required to move from `local-first` to public testnets.
- Implement explicit manual-override guards for broadcasting to real networks.
- Upgrade Key Management to support high-security signing boundaries.
