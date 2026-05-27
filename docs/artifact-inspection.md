# Artifact Inspection

HardKAS treats local JSON artifacts as the ultimate source of truth. Projections, databases, and memory states are ephemeral; the `.hardkas/artifacts/` directory is canonical.

If you are experiencing unexpected behavior (e.g., a transaction won't replay, or a lineage is broken), you should inspect the underlying artifacts.

## `hardkas artifact inspect`

The `inspect` command provides a deep, human-readable summary of any artifact's deterministic properties.

You can inspect an artifact by **path**:
```bash
hardkas artifact inspect .hardkas/artifacts/tx-plan-123.json
```

Or by **hash / ID**:
```bash
hardkas artifact inspect plan-a1b2c3d4e5f6
```

### What `inspect` tells you

* **Schema/Type**: (e.g., `hardkas.txPlan.v1`) Dictates what data this artifact holds and how it can be replayed.
* **Canonical Hash**: The deterministic SHA-256 hash of the artifact's payload. This hash *ignores* mutable metadata (like local timestamps) to ensure cryptographic reproducibility.
* **Parents / Lineage ID**: The causal ancestors of this artifact. If an artifact is missing a parent, it cannot be deterministically replayed.
* **Replayability**: 
  * `supported`: The artifact is a core semantic artifact (like a plan or receipt) that the `replay` engine understands.
  * `unsupported`: The artifact is metadata, local cache, or an older schema that cannot be replayed.
  * `unknown`: The runtime cannot determine replayability.

## Outputting as JSON

For automation or scripting, pass the `--json` flag:

```bash
hardkas artifact inspect plan-a1b2c3d4e5f6 --json
```

This returns a stable schema containing the resolved path, `canonicalHash`, and `replayability` status.

## Verification

If you suspect an artifact has been manually tampered with, use `verify`:

```bash
hardkas artifact verify --strict
```

This will recalculate the canonical hashes of all artifacts and compare them against their stated IDs and parent references. Tampered artifacts will be flagged.
