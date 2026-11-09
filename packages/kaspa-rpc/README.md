# @hardkas/kaspa-rpc

The wRPC client HardKAS uses to talk to a Kaspa node (kaspad).

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/kaspa-rpc
```

`@hardkas/cli` and `@hardkas/sdk` depend on it.

## What it contains

- `JsonWrpcKaspaClient`, a typed client over the official kaspa-wasm `RpcClient`.
- Typed RPC errors, health checks and resilience helpers.
- Adapters under `@hardkas/kaspa-rpc/adapters`.

A client can be bound to a network: then a connection is refused unless the node says it serves that network.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
