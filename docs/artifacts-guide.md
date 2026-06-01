# Artifacts Guide

HardKAS is an artifact-centric runtime. Everything that happens in a workspace is recorded as a cryptographically verifiable JSON artifact.

## The `.hardkas/` Directory

When you run `hardkas init` or execute a workflow with `autoBootstrap: true`, HardKAS creates a `.hardkas/` directory in your workspace root.

```
.hardkas/
├── artifacts/       # Authoritative, hash-addressed JSON documents
├── events.jsonl     # The canonical, append-only causal ledger
├── localnet.json    # The local simulated network state
└── telemetry.jsonl  # Observational logs and metrics
```

## Immutable and Append-Only

Artifacts are **never modified**. Once a transaction plan, signature, or receipt is generated, it is atomically written to disk with a hash of its contents as its filename.

If you attempt to modify an artifact by hand, the Replay Engine and the `verify` command will detect the corruption and fail the build.

## Identity and Lineage

Every artifact contains:
1. `artifactId`: Its deterministic hash.
2. `parentId` / `causalDependencies`: Pointers to the artifacts that preceded it.

This creates a verifiable lineage graph. A receipt is only valid if its parent signed artifact is valid, which is only valid if its parent plan artifact is valid.

## Querying Artifacts

Do not parse the JSON files manually. Use the CLI or SDK:

```bash
# Get the JSON of an artifact
pnpm hardkas artifact inspect <artifactId>
```

```typescript
// Query artifacts programmatically
const receipts = await sdk.query.findArtifacts({ type: 'tx-receipt' });
```
