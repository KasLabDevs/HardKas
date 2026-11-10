# @hardkas/storage-postgres

PostgreSQL storage for `@hardkas/toolkit`: a job store and an invoice store.

**Not published in this release.** `@hardkas/storage-postgres` is a private workspace package: no published HardKAS package depends on it, so this release puts no version of it on npm and the install command below does not fetch this version. Inside the HardKAS monorepo it stays a workspace package. See [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md#not-published) ("Not published").

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/storage-postgres
```

A standalone library. It uses the `postgres` client and needs a PostgreSQL server you run.

## What it contains

- `PostgresStorage` and `postgresStorage`.
- The PostgreSQL job and invoice stores.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
