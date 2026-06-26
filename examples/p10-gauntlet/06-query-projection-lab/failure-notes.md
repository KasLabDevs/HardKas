# Predicted Friction Points

- Accessing `query-store` directly without SDK abstraction reveals internal DB schema.
- Rebuilding the projection with `force: true` might crash the whole indexing process if it encounters a malformed JSON file instead of skipping it and logging a warning.

## Actual Friction Encounters

1. **Internal DB Schema**: The table `utxos` does not exist. (The query-store probably normalizes events, not state like utxos).
2. **Foreign Key Bug on Missing Plan Artifacts**: When `sync({ force: true })` runs, if a `simulated-plan-xxx-tx.json` (receipt) exists without its parent `txPlan-xxx.json` written to disk, the indexer tries to link lineage but fails with `Failed to link lineage for undefined: FOREIGN KEY constraint failed`. The indexer gracefully catches it as a warning, but this shouldn't trigger an SQL error.
3. **Resilience**: The indexer correctly skipped the intentionally malformed `signedTx-garbage12345.json` and reported it in the `stats.issues` array! Excellent design.
