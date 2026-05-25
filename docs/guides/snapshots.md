# HardKAS State Snapshot Management

State snapshots allow developers to freeze, capture, and restore virtual block DAG UTXO configurations.

---

## 1. Creating Snapshots

To freeze the current state of virtual account balances and BlockDAG allocations:

```bash
# Capture current state as a snapshot named checkpoint-1
hardkas localnet snapshot create checkpoint-1
```

This generates a `hardkas.snapshot` artifact inside `.hardkas/`, sealing the UTXO matrix and state hashes.

---

## 2. Replaying Snapshots

You can restore or verify a snapshot at any time:

```bash
# Verify snapshot mathematical invariants
hardkas localnet snapshot verify checkpoint-1

# Reconstruct timeline state
hardkas localnet snapshot replay checkpoint-1
```

---

## 3. Causal Time-Travel Replay

Reconstructing state works dynamically:
* If a snapshot represents DAA Score `1000`, the localnet engine rolls back modern mutations to match the exact snapshot invariants in milliseconds.
* This allows isolated testing of branch transaction sets from historical anchors.
