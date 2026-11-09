# @hardkas/localnet

The local network state of a workspace: the simulated chain in `.hardkas/localnet.json`, its accounts, receipts, traces and snapshots.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/localnet
```

`@hardkas/cli` and `@hardkas/sdk` depend on it.

## What it contains

- Load and save of the localnet state (`loadLocalnetState`, `saveLocalnetState`).
- Faucet, balances, transactions, receipts and traces of the simulated chain.
- Snapshots (`createLocalnetSnapshot`, `verifySnapshot`, `restoreLocalnetSnapshot`), fork and replay.

## Status

Snapshots, fork and replay are preview. HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
