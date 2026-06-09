# Testing And Audits

HardKas makes local-first reliability and safety claims. The 0.9.0-alpha line should be judged by whether a developer can initialize a workspace, create local artifacts, replay them, query them, and detect obvious corruption without touching mainnet.

## 1. Local Cryptographic Audit

The local artifact layer is expected to validate:

- Tamper detection for changed amounts, recipients, payloads, or lineage metadata.
- Deterministic hashing across platforms and JSON formatting differences.
- Signature boundaries between planning, signing, and sending.
- Canonical serialization for strings, numbers, BigInts, and metadata exclusions.

These checks are most important for the simulated and simnet flows because those are the supported development paths today.

## 2. CLI Command Coverage

The generated CLI reference currently exposes 197 commands and subcommands. Coverage should focus first on the stable local workflow:

```bash
hardkas init
hardkas tx send --from alice --to bob --amount 1 --network simulated --yes
hardkas query store sync
hardkas query artifacts list
hardkas verify --deep
hardkas artifact verify <artifact-path> --strict
```

Preview and research commands can exist, but they should be clearly marked and should not be treated as part of the happy path until they have the same smoke coverage.

## 3. Torture Matrix

HardKas includes stress-oriented runners for lock handling, replay, snapshots, query-store rebuilds, and local transaction flows. Those tests should prove that generated artifacts and projections can recover from interruption or stale local state.

The SQLite query store remains a projection. The source of truth is the workspace artifact/event data.

## 4. SDK Gauntlet

The SDK should be validated against the same happy path as the CLI:

1. Create or load a local workspace.
2. Plan a simulated transfer.
3. Sign the plan.
4. Simulate/send locally.
5. Read artifacts and lineage.
6. Rebuild/sync the query store.

Mainnet and real-node tests are later-stage hardening work, not the default release gate.
