# HardKAS Known Limitations

HardKAS is designed as a deterministic runtime for causal debugging and execution transparency. However, to maintain absolute determinism within local constraints, it imposes specific design limitations. You must understand these boundaries when relying on its diagnostic tools.

## Deterministic Boundaries & Finality

- **Local Reproducibility vs Global Consensus:** HardKAS guarantees that local replays of your artifacts are mathematically reproducible given the same pre-state. It **does not** guarantee that the transaction will be accepted by consensus networks (L1 or L2) if the external finality has drifted since the snapshot was taken.
- **Timestamp Drifts (Runtime Noise):** HardKAS isolates deterministic variables (like amounts and hash chains) from runtime noise (like `createdAt` metadata). Changes to timestamps during replay are mathematically ignored by the strict validation checks to prevent false positives.

## State Projections vs Authority

- **SQLite is a Cache, not an Authority:** SQLite is strictly used as an indexing projection layer. If you modify `.hardkas/projections/store.db` manually, HardKAS will likely flag it as stale, ignore your changes, or forcibly rebuild it from the filesystem authority (`.hardkas/artifacts`).
- **External Filesystem Mutations:** Modifying artifact JSON files directly on disk bypasses the deterministic event sequencer. While `hardkas doctor --strict` will catch these corruptions as `[ARTIFACT_HASH_MISMATCH]`, HardKAS will refuse to project them. You must repair them via HardKAS workflows or discard them.

## Snapshots

- **Scope of Snapshots:** A snapshot (`hardkas localnet snapshot create`) creates a deterministic ZIP capture of your local `.hardkas/artifacts` tree. It is a local workflow debugging tool. It is **not** a global chain proof and carries no consensus-validated weight outside of your HardKAS environment.

## Visual Diagnostics & Telemetry

- **Visual Tests are Mock-Bound:** The Playwright visual regression tests (`pnpm test:visual:ci`) are built upon committed deterministic fixtures. They validate the UI state transitions (like Corrupted Banners or Provenance Trees), but they do not hit live blockchains or external RPC endpoints.
- **Event Timeline is Local:** The event timeline (`EventsPage` and `/api/events`) is a local causal ledger of operations performed by the CLI and Node Server on the filesystem. It is not distributed telemetry and cannot track external applications mutating the node state.

## Integrations

- **Wallet Connectivity:** The wallet integrations (e.g. Kaspa Wallet plugin) are designed purely for development and testing ergonomics within localnet/simulated environments. They do not employ production custody security measures and plaintext paths may be utilized in legacy keystores.
- **L2 / Igra:** L2 testing is strictly experimental.

## Local Workstation Containment

- **Loopback Boundaries (CORS / Host Validation):** The local dev-server is locked down strictly to localhost. You cannot hit the API from external browser origins, and custom Host headers are rejected (preventing DNS rebinding). In order to expose the server for remote access, the explicit `--unsafe-external` flag must be set. Note that API Token authentication remains strictly active and required under all execution configurations.

These limitations are actively maintained. If your use case violates these constraints, consider restructuring your workflow to treat HardKAS as a deterministic build artifact pipeline rather than a live node consensus tracker.
