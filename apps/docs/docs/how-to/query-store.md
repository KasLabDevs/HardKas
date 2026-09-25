---
title: Query Store (Projections)
---

import QualificationContext from '@site/src/components/QualificationContext';

# Query Store

The **Query Store** is a local SQLite database that acts as a read-model projection over the durable artifacts in your `.hardkas/` workspace. 

## Architectural Constraint
**The Query Store does not own state.** 

It is strictly a read-only projection designed for fast queries (e.g., used by the Dashboard or the `hardkas query` CLI commands). If the SQLite database is deleted, corrupted, or out of sync, it can be reconstructed as a derived read model from the Canonical Store (the artifacts and events stored on disk).

## Commands

### `hardkas query store sync`
Synchronizes filesystem artifacts into the query index.
- **Contract:** Idempotent. It reads all `.hardkas/artifacts/` files, validates their schema, and inserts them into SQLite.
- **Evidence Level:** None. This command only mutates the local read-projection.

### `hardkas query store doctor --migrate`
Checks the integrity of the SQLite schema and applies pending migrations.

### `hardkas query artifacts list`
Lists artifacts with deterministic filters.
- **Example:** `hardkas query artifacts list --schema txPlan --json`

### `hardkas query lineage chain <artifactId>`
Explains ancestors or descendants of an artifact using the indexed Evidence DAG.

<QualificationContext capabilityId="artifacts" />
