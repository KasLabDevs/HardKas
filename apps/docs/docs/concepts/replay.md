---
title: Replay
---

import QualificationContext from '@site/src/components/QualificationContext';

# Deterministic Replay

When a transaction behaves unexpectedly, HardKAS provides a Replay engine that reconstructs the recorded local execution context and verifies the transition against the original artifacts and invariants.

## Replay Boundaries

Replay is **strictly bound** to the execution environment where the transaction occurred.

### Simulator (Supported)
Transactions executed against the HardKAS Simulator can be deterministically replayed. 
- HardKAS reconstructs the synthetic state precisely as it existed at the time of the transaction .
- It applies the transition.
- It verifies that the resulting state perfectly matches the invariants: `lineage OK`, `determinism OK`, `contamination OK`.

### Localnet / Real Node (Unsupported)
Transactions executed against a real Kaspa node (e.g., via Docker `simnet` or Mainnet) **cannot** be replayed by HardKAS.
- **Contract:** Real-node receipts fail-closed during replay, returning a `REPLAY_MODE_UNSUPPORTED` error.
- **Reasoning:** HardKAS cannot reconstruct the historical state of a live Kaspa node deterministically from local artifacts alone. Real-node validation belongs to the Kaspa consensus engine.

## Command

```bash
hardkas replay verify .hardkas/artifacts
```

<QualificationContext capabilityId="artifacts" />
