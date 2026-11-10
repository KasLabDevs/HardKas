# @hardkas/simulator-adapters

React Query hooks over the offline L1 to L2 bridge lab of `@hardkas/bridge-local`.

**Not published in this release.** `@hardkas/simulator-adapters` is a private workspace package: no published HardKAS package depends on it, so this release puts no version of it on npm and the install command below does not fetch this version. Inside the HardKAS monorepo it stays a workspace package. See [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md#not-published) ("Not published").

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/simulator-adapters
```

A standalone library. It needs `react` and `@tanstack/react-query` (peer dependencies).

## What it contains

- `useBridgeLocalPlan` and `useBridgeLocalSimulation`.

This is a local lab: there is no production bridge, no deposit, no withdrawal and no custody.

## Status

Experimental (bridge lab). HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental.

## License

MIT
