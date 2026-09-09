---
title: Install HardKAS
description: Prerequisites, which HardKAS packages you need, and how to confirm the install worked.
---

# Install HardKAS

HardKAS is published to npm as a set of scoped packages. This page covers the
prerequisites, which packages you actually need, and how to confirm the install
worked.

If you would rather see a transaction first and read afterwards, go to the
[Quickstart](./quickstart.md) — it starts from an empty directory.

## Prerequisites

| Requirement | Version | Notes |
| :---------- | :------ | :---- |
| Node.js | `>=22.5.0` | Required by `@hardkas/pskt-native` and by the HardKAS repository itself. |
| A package manager | npm, pnpm, or yarn | The repository itself uses pnpm. |

Check your Node version before installing:

```bash
node --version
```

> [!IMPORTANT]
> Most HardKAS packages do not yet declare an `engines` field, so npm will not
> warn you on an older runtime. `hardkas doctor` currently checks for Node 18 or
> later, which is below the version the native package needs. Treat 22.5.0 as
> the real floor regardless of what either tool tells you.

Docker is **not** required for the default development loop, which runs against
the in-memory simulator. You only need it for the localnet baseline described in
[Localnet and Boundaries](../concepts/localnet-and-boundaries.md).

## Choose your packages

Install only what your project uses. Most projects start with the CLI and the
SDK.

| Package | Install when you want to | Runs in |
| :------ | :----------------------- | :------ |
| `@hardkas/cli` | Drive workflows from the terminal: plan, sign, inspect, replay. | Node.js |
| `@hardkas/sdk` | Do the same programmatically from TypeScript or JavaScript. | Node.js |
| `@hardkas/client` | Talk to a running dev-server over HTTP from a browser. | Browser |
| `@hardkas/react` | Use React bindings — `HardkasProvider` and hooks — over `@hardkas/client`. | Browser |

`@hardkas/react` builds on `@hardkas/client`; install the client alongside it.
The browser never imports the Node SDK directly — that boundary is deliberate
and is listed in the [Capability Matrix](../status/capability-matrix.md).

## Install

Add the CLI as a development dependency so the version is pinned per project and
travels with your lockfile:

```bash
npm install --save-dev @hardkas/cli
npm install @hardkas/sdk
```

Then invoke it through `npx`:

```bash
npx hardkas --version
```

### Installing the CLI globally

A global install gives you a bare `hardkas` command:

```bash
npm install --global @hardkas/cli
```

This is convenient for exploration, but a globally installed CLI can drift from
the version your project depends on. For anything you intend to reproduce — and
reproducibility is the point of HardKAS — prefer the per-project install above.

## Verify the install

```bash
npx hardkas --version
npx hardkas doctor
```

`doctor` is the stable health check. It reports your Node and package-manager
versions, whether a `.hardkas/` workspace exists and is git-ignored, workspace
lock state, keystore permissions, and whether Docker and a local node are
reachable. It exits `0` when nothing is broken.

Warnings and skips are normal on a fresh machine. Before you have run anything,
expect `store.db not found` and `Local node RPC: Node is not running` — neither
is a failure, and the summary line distinguishes passes from failures:

```text
Summary: 9 passed, 0 failed, 2 warning, 2 skipped
```

For the authoritative list of what this release does and does not claim, see
[Release Claims](../status/claims.generated.md).

> [!NOTE]
> You may see `hardkas capabilities` referenced elsewhere. It prints a richer
> feature matrix, but it is marked internal/experimental and asks you to set
> `HARDKAS_EXPERIMENTAL=1`. Prefer `doctor` for routine checks.

## A note on WASM

HardKAS loads Kaspa's WASM bindings at runtime. Modern bundlers support this,
but your build must not strip `.wasm` assets. If WASM cannot be loaded, the
capability probe degrades gracefully and reports the affected Kaspa features as
unavailable instead of crashing.

## Next steps

- [Quickstart](./quickstart.md) — plan, sign, and simulate your first transaction.
- [Configuration](./configuration.md) — what `hardkas.config.ts` controls.
- [Execution Worlds](../concepts/execution-worlds.md) — simulator, localnet, and RPC.
