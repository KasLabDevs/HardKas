---
title: "HardKAS vs kaspa-wasm or your own test harness"
sidebar_label: "HardKAS vs kaspa-wasm"
description: "When HardKAS saves work over calling kaspa-wasm directly or scripting your own local node, and when it does not: mainnet, production wallets, browser apps."
---

# HardKAS vs kaspa-wasm or your own test harness

HardKAS does not replace `kaspa-wasm`: it builds on it. Use HardKAS for the development loop — a local node, accounts,
tests and checkable artifacts. Use `kaspa-wasm` directly for production wallets, browser apps and anything on mainnet,
which HardKAS locks.

`kaspa-wasm` is the official Kaspa SDK (from `rusty-kaspa`). A test harness of your own is usually a few scripts around
it plus a `rusty-kaspad` container. HardKAS is that harness, written once and kept in step with the official tools.

## Side by side

| | `kaspa-wasm` directly | Your own harness (scripts + a node in Docker) | HardKAS |
| :-- | :-- | :-- | :-- |
| Local node | you run `rusty-kaspad` yourself | your `docker-compose` | `hardkas localnet start`: `rusty-kaspad` v2.1.0 pinned by image digest, with a CPU miner ([Run your own simnet node](../start/simnet-node.md)) |
| Test funds | mine or use a faucet by hand | your script | `hardkas localnet fund` mines to an account on the local node |
| Building a transaction | the Generator of `kaspa-wasm` | the Generator, from your code | the same Generator, through `hardkas tx plan` or the SDK ([Plan, sign and send](../guides/transactions/plan-sign-send.md)) |
| Keys | your code | your code | development accounts and an encrypted keystore ([Accounts](../guides/accounts.md)) |
| Wrong-network guard | none | yours | refuses a mismatched network or account; mainnet is locked ([Security Model](security-model.md)) |
| Evidence | none | logs | an artifact for every step, with a content hash and its lineage; `hardkas artifact verify` checks it ([Artifact Lifecycle](artifact-lifecycle.md)) |
| SilverScript | you run `silverc` yourself | yours | the pinned `silverc` v1.0.0; compile and verify byte for byte, deploy and spend ([Compile and verify](../guides/silverscript-covenants/compile-and-verify.md)) |
| Mainnet | yes | yes | **no**: locked in this release |
| Runtime | any Node.js or a browser | yours | **Node.js 24.22.1 exactly** ([Install HardKAS](../start/installation.md)) |

## When not to use HardKAS

- **Mainnet.** HardKAS refuses mainnet connections, keys, signing and broadcast. Use `kaspa-wasm` or a wallet.
- **A production wallet or custody.** HardKAS keys are development keys; it is not a wallet.
- **A browser app.** HardKAS is built for a Node.js development loop; `@hardkas/sdk/client` loads in a page only for
  the experimental browser-wallet integration ([Browser wallets](../start/browser-wallets.md)).
- **A project that cannot pin Node.js 24.22.1.** HardKAS is built and tested on that exact version.
- **A team that already has its own harness and needs no evidence.** HardKAS mostly saves the work of building one;
  its artifacts matter when you want to check afterwards what happened.

What HardKAS verifies, and on which network, is listed in [What works in this release](../start/what-works.md).
