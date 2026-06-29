# Lab 19: Sync Frictions Captured

The HardKAS framework has completed Phase 1 of P58.

We successfully built `labs/19-sync-friction-lab`, implementing a raw sync loop using the `@hardkas/plugin-rpc-backend` directly in application space. The resulting code was highly brittle, error-prone, and required extensive manual logic to handle:

- Polling and parsing `blueScore` updates.
- Local checkpointing and file system management.
- Disconnect handling midway through state mutations.
- Traversing multiple observed wallets efficiently.
- Capturing `SIGINT` for safe shutdowns without corrupting the state.

The exhaustive findings are documented in `labs/19-sync-friction-lab/FRICTIONS.md`.

We have captured exactly *why* a Sync Daemon is necessary, proving the friction exists. We are now cleared to implement `@hardkas/sync-daemon` to absorb this complexity in Phase 2.
