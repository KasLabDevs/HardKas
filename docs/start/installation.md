---
title: Install HardKAS
description: Prerequisites, which HardKAS packages you need, the optional peers and toolchains, and how to confirm the install worked.
---

# Install HardKAS

HardKAS is published to npm as a set of scoped packages. This page covers the
prerequisites, which packages you actually need, what HardKAS downloads on first
use, and how to confirm the install worked.

If you would rather see a transaction first and read afterwards, go to the
[Quickstart](./quickstart.md) (simulated, no node) or, for a real transaction on
a node of your own, [Build on your own simnet](./build-on-simnet.md).

> [!WARNING]
> **Mainnet is NO-GO in this release.** HardKAS refuses to sign or broadcast on
> mainnet. `doctor`, `artifact verify` (which checks a mainnet artifact offline
> only) and the Silver commands never contact a mainnet node, and no mainnet
> endpoint is built in: read-only commands such as `rpc info` reach one only if
> you declare it yourself. Use simnet, or testnet-10 if you hold testnet funds.

## Prerequisites

| Requirement | Version | Notes |
| :---------- | :------ | :---- |
| Node.js | 24.22.1 exactly | The only supported runtime: HardKAS is built and tested on it, and it is its security baseline. |
| A package manager | npm, pnpm, or yarn | The commands on these pages use npm (`npx`). The repository itself uses pnpm. |
| Docker | Any recent Docker Engine or Docker Desktop | Only for a real local node ([Run your own simnet node](./simnet-node.md)). The simulated loop needs no Docker. |
| Network access on first use | GitHub release downloads | `hardkas init` installs the pinned Kaspa WASM SDK; `hardkas toolchain install silverc` installs the SilverScript compiler. Both are checked against pinned SHA-256 digests. |

Operating systems: this release candidate was exercised end to end (install,
simnet node, payment, SilverScript and covenants) on **Windows 11 x64**. Linux and
macOS are expected to work, since HardKAS is Node.js plus the official release
assets of kaspa-wasm and silverc for those platforms, but they were **not
verified** for this release.

Check your Node version before installing:

```bash
node --version
```

> [!IMPORTANT]
> `@hardkas/core`, `@hardkas/cli` and `@hardkas/testing` declare
> `engines: 24.22.1`; the other packages do not declare an `engines` field yet,
> and npm only warns about it. `hardkas doctor` passes on 24.22.1, warns on
> another 24.x and fails on any other major line. Use Node.js 24.22.1.

## Choose your packages

A release publishes 30 packages; the full list, and why each one is published, is
in [Versioning: published packages](../status/versioning.md#published-packages).
Install only what your project uses. Most projects start with the CLI and the
SDK, which pull in the rest of what they need.

| Package | Install when you want to | Runs in |
| :------ | :----------------------- | :------ |
| `@hardkas/cli` | Drive workflows from the terminal: plan, sign, send, wait, verify, inspect. | Node.js |
| `@hardkas/sdk` | Do the same programmatically from TypeScript or JavaScript. | Node.js |
| `@hardkas/testing` | Write project tests (scenario runner and matchers, with vitest). | Node.js |
| `@hardkas/client` | Talk to a running dev-server over HTTP from a browser. | Browser |
| `@hardkas/react` | Use React bindings — `HardkasProvider` and hooks — over `@hardkas/client`. | Browser |

`@hardkas/react` builds on `@hardkas/client`; install the client alongside it.
The browser never imports the Node SDK directly — that boundary is deliberate
and is listed in the [Capability Matrix](../status/capability-matrix.md).

Not published, so not installable from npm: `@hardkas/l2`, `@hardkas/ext-l2` (the
L2 extension) and `@hardkas/pskt-native`
([why](../status/versioning.md#not-published)).

### Optional peer: snarkjs (GPL-3.0)

`@hardkas/sdk` declares `snarkjs` as an **optional** peer dependency. Installing
the SDK does not install it. Without it, the Groth16 check of a ZK fixture
reports `ZK_ENGINE_UNAVAILABLE` and verifies nothing. snarkjs is GPL-3.0; if you
accept that license and need the check:

```bash
npm install snarkjs@0.7.6
```

Nothing else in HardKAS needs it. The ZK surface is local and experimental: no
on-chain verification is claimed ([limitations](../status/limitations.md#6-the-zk-surface-is-local-only-and-experimental)).

## Install

Start from an empty directory. The SDK is published as ES modules, so mark the
project as one:

```bash
mkdir my-hardkas-app
cd my-hardkas-app
npm init -y
npm pkg set type=module
```

Add the CLI as a development dependency so the version is pinned per project and
travels with your lockfile. Name the version: until this release is tagged
`latest` on npm, a bare `npm install @hardkas/cli` installs the previous one
(`0.12.0-rc.29`).

```bash
npm install --save-dev @hardkas/cli@0.13.0-rc.1
npm install @hardkas/sdk@0.13.0-rc.1
```

In a TypeScript project, also install the Node.js type definitions. The
packages' type declarations use Node.js types (`Buffer`, `node:events`), and
`@hardkas/core` lists `@types/node` only as an optional peer dependency, so it
is not installed for you:

```bash
npm install --save-dev @types/node@24
```

Then invoke it through `npx`:

```bash
npx hardkas --version
```

npm 11 may warn that `esbuild` has an install script not covered by
`allowScripts`. HardKAS does not need that script to run.

`npm audit` reports advisories in this release's dependency tree: `zod` 3
(GHSA-mrhx-c7xc-m3w5, fixed only in zod 4, a major upgrade), `@hono/node-server`
used by the local dev-server (GHSA-rmxm-3fg6-px4f), and, after the test step
below, `vitest` 2. They are known and tracked for the next cycle; this release
does not upgrade them. Keep HardKAS to local development networks, as the rest of
this guide does.

### Installing the CLI globally

A global install gives you a bare `hardkas` command:

```bash
npm install --global @hardkas/cli@0.13.0-rc.1
```

This is convenient for exploration, but a globally installed CLI can drift from
the version your project depends on. For anything you intend to reproduce — and
reproducibility is the point of HardKAS — prefer the per-project install above.

## Initialize the workspace

```bash
npx hardkas init .
```

`init` writes `hardkas.config.ts` (default target: the simulator; a `simnet`
network is declared too), `.hardkas/` with five funded simulated accounts,
`.gitignore`, `vitest.config.ts` and an example test. It also installs the Kaspa
WASM SDK this release pins (`kaspa-wasm` 2.1.0, from the official rusty-kaspa
release, about 12 MB installed) into `~/.hardkas/toolchains/` and checks it against its
pinned SHA-256; planning and signing use it. If that step fails, `init` stops
with an error and `npx hardkas toolchain install kaspa-wasm` installs it by hand.
Set `HARDKAS_HOME` to keep toolchains somewhere other than `~/.hardkas`.

`init` creates a `package.json` only when there is none. In the flow above npm
already created it, so `init` adds no test script or test dependencies, and its
"npm test" hint does not apply yet. To run the example test:

```bash
npm install --save-dev @hardkas/testing@0.13.0-rc.1 vitest@^2
npm pkg set scripts.test="vitest run"
npm test
```

## Verify the install

```bash
npx hardkas --version
npx hardkas doctor
npx hardkas toolchain status
```

`doctor` is the stable health check. It reports your Node and package-manager
versions, whether a `.hardkas/` workspace exists and is git-ignored, workspace
lock state, keystore permissions, and whether Docker and a local node are
reachable. It exits `0` when nothing is broken.

Warnings and skips are normal on a fresh machine (before you have run anything,
for example, `store.db not found`); neither is a failure, and the summary line
distinguishes passes from failures (the counts depend on your machine).

When the workspace's network declares a node (or you pass `--network simnet` or
`--url`), `doctor` also asks that node once, with a bounded timeout, and reports
connectivity, network identity, sync and what it can run
(`--flow payment,silver,covenant`), each with a typed code in `--json`. Without a
node it says the diagnosis is partial
([Run your own simnet node](./simnet-node.md#4-point-the-workspace-at-the-node)).
`npx hardkas silver doctor --network simnet` checks SilverScript and covenant
readiness.

For the authoritative list of what this release does and does not claim, see
[Release Claims](../status/claims.generated.md), and for a plain table of what
works where, [What works in this release](./what-works.md).

> [!NOTE]
> The capability report (what this build contains, and what is ready in this
> environment) is the SDK's `capabilities.get()`. Use `doctor` for routine checks
> and `silver doctor` for SilverScript and covenant readiness.

## A note on WASM

HardKAS loads Kaspa's WASM bindings at runtime. Modern bundlers support this,
but your build must not strip `.wasm` assets. If WASM cannot be loaded, the
capability probe degrades gracefully and reports the affected Kaspa features as
unavailable instead of crashing.

## Next steps

- [Quickstart](./quickstart.md) — plan, sign, and simulate your first transaction (no node).
- [Build on your own simnet](./build-on-simnet.md) — a real node in Docker, a real payment, SilverScript and covenants.
- [Configuration](./configuration.md) — what `hardkas.config.ts` controls.
- [Execution Worlds](../concepts/execution-worlds.md) — simulator, localnet, and RPC.
