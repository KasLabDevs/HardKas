# @hardkas/jobs

A small job queue: runner, JSON store, checkpoints, retry policy and batch cursors.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/jobs
```

`@hardkas/toolkit` and `@hardkas/storage-postgres` depend on it.

## What it contains

- `JobRunner` and `JobStoreJson`.
- Checkpoints, retry policies, progress reporting and batch cursors.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
