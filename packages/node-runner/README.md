# @hardkas/node-runner

A managed kaspad in Docker, pinned by image digest, and the checks of the node's identity.

Part of [HardKAS](https://github.com/KasLabDevs/HardKas), local-first developer tooling for Kaspa L1.

## Install

```sh
npm install @hardkas/node-runner
```

`@hardkas/cli` and `@hardkas/sdk` depend on it.

## What it contains

- `DockerKaspadRunner` and its typed errors.
- `verifyNodeIdentity`, `requireNodeIdentity` and `requireEndpointIdentity`.

Its default image is the pinned rusty-kaspad reference image, by digest (`HARDKAS_KASPAD_IMAGE` overrides it). It needs a Docker engine on the machine.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
