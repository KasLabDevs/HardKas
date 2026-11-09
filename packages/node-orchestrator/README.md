# @hardkas/node-orchestrator

Starts and checks local kaspad processes and topologies, with an identity-checked process manager.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/node-orchestrator
```

`@hardkas/cli` depends on it.

## What it contains

- `buildKaspadArgs` and the runtime config of a node.
- `getNodeStatus` and `doctorKaspaNode`.
- An identity-checked process manager (process and listening-socket identity).

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
