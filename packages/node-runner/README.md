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
- The native process manager that was `@hardkas/node-orchestrator`: `startManagedProcess`, `stopManagedProcess`,
  `getManagedProcessStatus` and `readManagedProcessLog` start, watch and stop a local process HardKAS started, and never
  one it did not: the binary is checked against its pin before it runs, and a stop acts only while the operating
  system confirms the pid is the recorded process (creation instant and executable, `readProcessIdentity`). The
  unpublished l2 extension runs its Anvil node on it. The kaspad helpers next to it
  (`startKaspaNode`, `stopKaspaNode`, `getNodeStatus`, `doctorKaspaNode`) are called by no HardKAS command: the CLI's
  node is the Docker one above.

Its default image is the pinned rusty-kaspad reference image, by digest (`HARDKAS_KASPAD_IMAGE` overrides it). It needs a Docker engine on the machine.

## Status

HardKAS is an alpha: APIs may change between releases. [Versioning](https://github.com/KasLabDevs/HardKas/blob/main/docs/status/versioning.md) says what is stable, preview and experimental. Mainnet is blocked by policy in this release.

## License

MIT
