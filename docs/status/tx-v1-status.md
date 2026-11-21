# Kaspa L1 Toccata: Transaction V1 Status

> **Updated for `0.13.0-rc.3`:** Transaction V1 planning, signing, and broadcast are **implemented and verified on `simnet`** (`rusty-kaspad` v2.1.0). The earlier dependency block in `kaspa-wasm` has been resolved.

## Supported (Real Node: `simnet` / `devnet`)
- **V1 Planning & Compute Budgets:** Supported via `@hardkas/tx-builder` (`v1-plan`, `v1-budgets`, `v1-mass`) and `@hardkas/sdk` (`sdk.covenants`, `sdk.kcc20`).
- **V1 Signing & Broadcast:** Supported for SilverScript Toccata covenants (`hardkas silver covenant genesis`, `transition`, `start`, `advance`), SilverScript v1 deploys/spends (`--tx-version 1`), and KCC-20 token operations.

## Intentional Boundaries
- **Standard Payments Stay V0:** Plain payments, batches, and consolidations use transaction `v0` by design.
- **Simulated Mode Refuses V1 Signing:** `hardkas.tx.sign()` in `simulated` mode refuses `v1` plans with `TX_V1_SIMULATION_UNSUPPORTED`; validate `v1` transactions against a real `rusty-kaspad` `v2.1.0` `simnet` node.
- **Mainnet Refused:** Mainnet signing and broadcast remain blocked by policy across all transaction versions (`MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`).
