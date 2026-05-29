# Deterministic Replay Tutorial

HardKAS relies on deterministic replays to guarantee the correctness of your application state.

## The Concept

Instead of trusting the network blindly, HardKAS records every transaction workflow locally as a series of artifacts:

1. **Transaction Plan**
2. **Signed Payload**
3. **Receipt**

The **Replay Report** is the final step. HardKAS takes the initial state and the Transaction Plan, executes it locally in a sandboxed runtime, and asserts that the resulting state exactly matches the Receipt.

## Running a Replay

After executing any transaction (e.g., via the `transfer` recipe), you can manually replay the last transaction:

```bash
hardkas dev last --replay
```

HardKAS will output a comprehensive replay report:

- `PASS`: The local deterministic execution perfectly matched the network receipt.
- `FAIL`: The execution diverged, indicating non-determinism, a semantic bug, or a compromised RPC node.

## Inspecting Artifacts

To understand why a replay succeeded or failed, you can inspect the full causal lineage of the artifact:

```bash
hardkas artifact inspect <artifact-id>
```

Or ask the CLI to explain the history:

```bash
hardkas why <artifact-id>
```

## Replay Failures

When a replay fails, the artifact is automatically quarantined. In the dashboard, you will see a red `FAIL` badge. Quarantined artifacts are isolated from the main projection loop, ensuring that corrupted state cannot pollute your local database.
