# Artifacts

Artifacts are the fundamental unit of state in HardKAS. They are JSON files stored in `.hardkas/artifacts/`.

## Determinism and Hashing

An artifact's ID is not random. It is a SHA-256 hash of its critical financial payload (the `sourcePlanId`, `amountSompi`, `networkId`, etc).

Metadata fields (like `hardkasVersion`) are purposefully excluded from the hash so that artifacts remain forward-compatible across CLI updates.

## Mutability Protection

If a malicious actor changes `amountSompi` from 10 to 10000 in a `txPlan`, the file's hash will no longer match its filename or internal `lineage.artifactId`. The CLI will reject it instantly.
