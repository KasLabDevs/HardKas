# @hardkas/query

Documentation: [hardkas.dev/docs](https://hardkas.dev/docs/) · Website: [hardkas.dev](https://hardkas.dev)

Queries over a workspace's artifacts and its query store: artifacts, lineage, replay, DAG, events and transactions.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/query
```

`@hardkas/cli` and `@hardkas/sdk` depend on it (`hardkas query …`).

## What it contains

- `QueryEngine` and `createQueryRequest`.
- Query adapters per domain, filters, formatting and `explain`.
- A payment tracker.

## Status

Preview (query-store projections). From 1.0 the boundaries listed as stable follow semantic versioning; preview and experimental surfaces may change between minor releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
