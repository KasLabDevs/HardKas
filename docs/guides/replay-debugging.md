# HardKAS Replay Debugging & Diagnostics

This guide provides troubleshooting steps for diagnosing and resolving replay failures.

---

## 1. Understanding Mismatch Codes

- `preStateHash mismatch`: The current localnet balance state does not match the starting state of the transaction.
  - **Solution**: Reset the virtual node state using `hardkas node reset` or align the DAG score to match the transaction's history.
- `artifactHash mismatch` (or `CORRUPTED`): The plan or receipt JSON content has been altered since creation.
  - **Solution**: Check git history or audit the workspace filesystem for unauthorized modifications.
- `fee mismatch` / `mass mismatch`: Calculated transaction mass differs from original metrics.
  - **Solution**: Verify if package dependencies or standard mass parameters have changed across versions.

---

## 2. Dynamic Causal Inspection

Use the CLI to inspect and diff executed plans:

```bash
# Display transactional lineage
hardkas tx verify ./artifacts/tx-plan-[hash].json

# Review causal path
hardkas workflow inspect [workflow-id]
```

These utilities output deterministic specs directly to console for rapid debugging.
