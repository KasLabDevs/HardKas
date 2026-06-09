# `@hardkas/artifacts`

The artifacts package is the persistence and verification layer for HardKas transaction plans, signed transactions, receipts, snapshots, and related local records.

## 1. Deterministic Hashing

HardKas artifacts are intended to be content-addressed and replayable. Verification recalculates canonical content and compares it with the stored metadata.

The hashing pipeline should preserve these invariants:

- Metadata such as timestamps and tool versions must not change the semantic hash.
- Object keys are sorted deterministically.
- BigInt values are serialized as decimal strings.
- Strings are normalized consistently.
- Hashing uses the canonical payload, not raw JSON formatting.

## 2. Workspace Boundaries

Artifact reads and writes should stay inside the workspace-controlled artifact area. Callers must not be able to use paths such as `../..` to escape into unrelated filesystem locations.

The expected secure flow is:

1. Resolve the requested path.
2. Compare it against the allowed artifact/workspace root.
3. Abort before reading or writing if the resolved path escapes that root.

## 3. Lineage Verification

Transaction artifacts form a chain:

```text
TxPlan -> SignedTx -> Receipt
```

The relationship is stored through artifact identifiers, content hashes, and lineage metadata. A strict verifier should fail if a parent artifact is missing, mutated, or inconsistent with the child that references it.

CLI checks:

```bash
hardkas verify --deep
hardkas artifact verify <artifact-path> --strict
```

Interactive queries can use the SQLite query store for speed, but the query store is only a projection. Deep verification should always go back to the artifact data.
