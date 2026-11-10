# @hardkas/dev-server

The local dev-server HTTP/SSE API behind `hardkas sandbox`.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/dev-server
```

`@hardkas/cli` depends on it. Web apps talk to it through `@hardkas/client` and `@hardkas/react`.

## What it contains

- `createDevServer`: the server, its routes and its event stream.
- A session token generated at start (or taken from `HARDKAS_DEV_TOKEN`).
- A file watcher and an atomic journal store.

## Status

Preview (dev-server HTTP workflow endpoints). HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
