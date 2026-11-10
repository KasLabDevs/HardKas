# @hardkas/sync-daemon

A polling daemon that feeds a node backend's new blocks to `@hardkas/toolkit` indexers, wallets and jobs.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/sync-daemon
```

A standalone library: nothing else in HardKAS depends on it.

## What it contains

- `SyncDaemon`, with its metrics (`sync_daemon_*`) on `@hardkas/observability`.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
