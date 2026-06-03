# CLI Guide

The HardKAS CLI (`npx @hardkas/cli`) provides a powerful interface to the core SDK logic. It contains over 120 commands, but they fall into a few primary categories.

## 1. Transactions
Commands to interact with the artifact lifecycle.

```bash
# Create a planned transaction artifact
npx @hardkas/cli tx plan --from alice --to bob --amount 10000

# Sign the plan
npx @hardkas/cli tx sign <plan_artifact_id> --signer alice

# Simulate the signed transaction
npx @hardkas/cli tx send <signed_artifact_id>
```

## 2. Artifacts
Commands to inspect and verify the deterministic JSON files.

```bash
# View the lineage and parent dependencies of an artifact
npx @hardkas/cli artifact lineage <artifact_id>

# Run a Zero-Trust verification on an artifact file
npx @hardkas/cli artifact verify <artifact_id>

# Explain the contents of an artifact in human-readable text
npx @hardkas/cli artifact explain <artifact_id>
```

## 3. Query & Analytics
Commands to query the SQLite indexer.

```bash
# Sync the event ledger to SQLite
npx @hardkas/cli query sync

# Find the lineage of a specific transaction
npx @hardkas/cli query lineage chain <artifact_id>
```

## 4. Replay Engine
Commands to mathematically prove execution equivalence.

```bash
# Replay a specific workflow
npx @hardkas/cli workflow replay <workflow_id>

# Diff two workflow executions
npx @hardkas/cli workflow diff <id1> <id2>
```

## 5. Diagnostics
Commands to verify workspace health.

```bash
# Verify all strict invariants
npx @hardkas/cli verify --strict

# Check overall CLI and Workspace health
npx @hardkas/cli doctor
```
