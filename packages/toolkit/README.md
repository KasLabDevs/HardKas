# @hardkas/toolkit

A backend kit for Kaspa apps: wallets, payments, UTXO reservations, an indexer, jobs, DAG and snapshot helpers, fee estimation.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/toolkit
```

`@hardkas/sdk` depends on it.

## What it contains

- `WalletToolkit`, `PaymentToolkit` and `IndexerToolkit`.
- Invoice and job stores, UTXO helpers and a fee estimator.
- A query API over the query store.

It carries no SilverScript compiler: SilverScript lives in `@hardkas/core` and `hardkas silver`.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
