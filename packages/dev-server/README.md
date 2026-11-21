# @hardkas/dev-server

The local dev-server HTTP/SSE API behind `hardkas sandbox`.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/dev-server
```

`@hardkas/cli` depends on it. Web apps talk to it over HTTP. (`@hardkas/client` and `@hardkas/react`, the monorepo's browser client and its React bindings, are not published in this release.)

## What it contains

- `createDevServer`: the server, its routes and its event stream.
- A session token generated at start (or taken from `HARDKAS_DEV_TOKEN`).
- A file watcher and an atomic journal store.
- `recoverStaleSendGuardLock(root, { pid })`: archives the send-guard lock a dev server left when its process was ended without running its handlers (on Windows, Stop-Process or Task Manager), kept as evidence. The CLI runs it as `hardkas dev recover-lock --pid <pid>`.

## Amounts in the HTTP API

`amountSompi` is in sompi (1 KAS = 100,000,000 sompi) on `POST /api/tx/plan`, `POST /api/tx/send` and `POST /api/wallet-probe/payment` alike. Send it as a string of decimal digits (`"150000000"`), or as a JSON number up to 2^53 - 1. A larger JSON number, a fraction, a negative or any other string is refused with `BAD_REQUEST`: JSON parsing has already rounded such a number, so it is never planned. (Before this release `/api/tx/plan` read the field as KAS.)

## Status

Preview (dev-server HTTP workflow endpoints). HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
