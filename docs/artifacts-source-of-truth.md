# Artifacts: The Source of Truth

In HardKAS, **artifacts are canonical**.

## Projections

The dev-server and the dashboard read from an SQLite database for fast queries. However, the **dev-server is not source of truth**. If the database is corrupted or deleted, it can be entirely rebuilt from the JSON artifacts on disk.

## Security Boundaries

1. **Kaspa L1 does not execute EVM.**
2. **Igra demo is read-only/experimental.**
