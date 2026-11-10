# @hardkas/plugin-local-indexer

A HardKAS plugin that appends every artifact the workspace writes to a local index (`.hardkas/indexer/artifacts.jsonl`).

**Not published in this release.** `@hardkas/plugin-local-indexer` is a private workspace package: no published HardKAS package depends on it, so this release puts no version of it on npm and the install command below does not fetch this version. Inside the HardKAS monorepo it stays a workspace package. See [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md#not-published) ("Not published").

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/plugin-local-indexer
```

A standalone library: nothing else in HardKAS depends on it.

## What it contains

- `localIndexerPlugin(options)`, the plugin.
- `LocalIndexerApi`, to read the index.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
