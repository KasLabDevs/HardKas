# Artifact Auditing

Artifacts are the verifiable trail of execution.

## Inspecting
```bash
hardkas artifact inspect .hardkas/artifacts/txPlan-123.json
```
This parses the JSON and presents the financial payload in a human-readable table. Use this in CI pipelines before approving a signing key.

## Verifying
```bash
hardkas artifact verify .hardkas/artifacts/txPlan-123.json
```
This re-computes the SHA-256 hash of the deterministic payload and asserts that it matches the filename and internal lineage pointer.
