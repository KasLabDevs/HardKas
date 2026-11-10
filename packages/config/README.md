# @hardkas/config

Loading and resolution of `hardkas.config.*` (networks, accounts, targets and endpoints).

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/config
```

`@hardkas/cli` and `@hardkas/sdk` depend on it.

## What it contains

- `defineHardkasConfig` for a typed config file.
- `loadHardkasConfig` to load the config of a workspace.
- Target, provider and endpoint resolution, and the config schema.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
