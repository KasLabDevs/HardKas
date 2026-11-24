# @hardkas/tx-builder

Documentation: [hardkas.dev/docs](https://hardkas.dev/docs/) · Website: [hardkas.dev](https://hardkas.dev)

Transaction planning, mass and fee rules, and plan verification.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/tx-builder
```

`@hardkas/cli` and `@hardkas/sdk` depend on it.

## What it contains

- Plans from the official kaspa-wasm Generator (`planPaymentWithGenerator`, `TxPlanService`).
- Mass and fee policy, v0 and v1 (covenant) budgets.
- Kaspa URIs, UTXO mapping, pending spends and covenant UTXO handling.

## Status

From 1.0 the boundaries listed as stable follow semantic versioning; preview and experimental surfaces may change between minor releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
