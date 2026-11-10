# @hardkas/sync-daemon

A polling daemon that feeds a node backend's new blocks to `@hardkas/toolkit` indexers, wallets and jobs.

**Not published in this release.** `@hardkas/sync-daemon` is a private workspace package: no published HardKAS package depends on it, so this release puts no version of it on npm and the install command below does not fetch this version. Inside the HardKAS monorepo it stays a workspace package. See [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md#not-published) ("Not published").

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
