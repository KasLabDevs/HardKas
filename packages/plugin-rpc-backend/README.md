# @hardkas/plugin-rpc-backend

An indexer backend plugin over a Kaspa node's RPC, with retries and reconnection, for `@hardkas/toolkit`.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/plugin-rpc-backend
```

A standalone library: nothing else in HardKAS depends on it.

## What it contains

- `kaspaRpcBackendPlugin({ url, resilience })`.
- Its resilience engine and typed RPC errors.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
