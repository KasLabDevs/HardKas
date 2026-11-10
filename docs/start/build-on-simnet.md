---
title: Build on your own simnet
description: The short path for a team new to HardKAS - install, run your own rusty-kaspad simnet node, send and verify a real transaction, then SilverScript and covenants.
---

# Build on your own simnet

The short path for a team that has never seen the HardKAS repository: install
the published packages, run a real Kaspa node of your own in Docker, send a
transaction it accepts and confirms, verify it, then deploy a SilverScript
contract and run a covenant. About half an hour, most of it reading.

> [!WARNING]
> - **Mainnet is NO-GO in this release, and locked down.** HardKAS makes no
>   connection to a mainnet node (reads included, even to an endpoint you
>   declare) and refuses to sign or broadcast on mainnet. This path never uses it.
> - **Testnet-10** only if you hold testnet funds; this path never needs it, and
>   transactions there were not tested with this release.
> - **vProgs is not active** on Kaspa L1; HardKAS only inspects vProgs artifacts.
> - **There is no trustless bridge** in HardKAS; the L2 packages are not published.
> - **The simulator is not evidence.** Only a real node's answer counts.

## What you need

- Node.js **24.22.1** exactly, and npm.
- Docker (Engine or Desktop), able to pull from Docker Hub once.
- Internet access the first time: npm packages, and two release assets from
  GitHub (the Kaspa WASM SDK and the SilverScript compiler), each checked against
  a pinned SHA-256.
- One free local port; these pages use `26510`.

## The path

1. [Install HardKAS](./installation.md): an empty project, `@hardkas/cli` and
   `@hardkas/sdk`, then `npx hardkas init .`.
2. [Run your own simnet node](./simnet-node.md): `rusty-kaspad` v2.1.0 (pinned by
   digest) and a CPU miner in Docker; point the workspace at it.
3. [Quickstart: a real transaction](./quickstart-simnet.md): accounts, funding,
   plan → sign → send → wait → receipt → `artifact verify`, then the same with
   the SDK.
4. [SilverScript and covenants](./silverscript-covenants.md): compile, deploy and
   spend a signed contract; create a covenant and advance it.
5. [Reading receipts and verification levels](./receipts-and-levels.md): what
   `SUBMITTED`, `CONFIRMED`, `NETWORK_OBSERVED` or `CONSENSUS_CONFIRMED` prove,
   and what they do not.
6. [What works in this release](./what-works.md): verified against a real node,
   experimental, unverified, not supported.
7. [Common errors and recovery](./common-errors.md): the real error codes and
   what to do.

Want to try HardKAS without Docker first? The [Quickstart](./quickstart.md)
runs the same lifecycle on the simulated ledger (`network: "simulated"`, a local
UTXO ledger with synthetic accounts, not the `@hardkas/simulator` node) in five
minutes; nothing it produces is network evidence.

## Tested as written

Every command on these pages was run as written for this release candidate: on
Windows 11 x64 with Node.js 24.22.1 and Docker 29.4.2, in a project outside the
HardKAS repository, with the packages installed from this release's tarballs,
against an own `rusty-kaspad` v2.1.0 simnet node. The outputs shown are excerpts
of that run; your addresses, ids and numbers will differ. Linux and macOS were
not exercised.

## Shells

Commands are written once when they are the same everywhere (every `npx hardkas …`
line is). Where shells differ (environment variables, multi-line `docker run`,
quoting JSON on the command line), the pages show each form.
