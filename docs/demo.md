# Operational Invariants Demo

This is a **2-minute reproducible demo** designed to prove the core runtime semantics and operational invariants of HardKAS in an isolated, headless CI/CD environment.

This is *not* a marketing demo. It demonstrates deterministic recovery, crash-consistency, and append-only authority logic.

## Execution

The demo is entirely automated via a cross-platform Node script:

```bash
node scripts/demo.mjs
```

## The 7-Step Sequence

1. **Bootstrap**: `hardkas dev --once --headless --json`
   Initializes the workspace, establishes local capabilities, and validates the environment without blocking as a daemon.

2. **Predictive Dry-Run**: `hardkas workflow run demo-transfer --dry-run --json`
   Simulates a full declarative workflow in agent mode, generating an upfront `workflowId` based on content hashing and ensuring policy compliance (no mutations allowed).

3. **Real Execution**: `hardkas workflow run demo-transfer --json`
   Executes the workflow, writes verifiable append-only JSON artifacts to `.hardkas/artifacts/`, and projects the results onto the SQLite read model.

4. **Replay Verification**: `hardkas replay verify --json`
   Verifies that the deterministic execution traces of workflow artifacts produce identical output states and signatures, guaranteeing causal continuity.

5. **Simulated Wipe**: `rm .hardkas/store.db`
   Simulates a catastrophic disk failure or data corruption by erasing the SQLite projection state.

6. **Deterministic Rebuild**: `hardkas rebuild --from-artifacts --json`
   Demonstrates the "Filesystem Authority" model: the query store is completely reconstructed by streaming the append-only canonical artifacts back into the projection.

7. **Lineage Validation**: `hardkas verify --deep --json`
   Performs a cryptographic verification of all artifacts in the workspace, asserting that hashes, signatures, and causal chains remain unbroken after the rebuild.
