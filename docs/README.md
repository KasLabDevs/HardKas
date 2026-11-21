---
title: HardKAS documentation
description: Install HardKAS, run a first Kaspa L1 transaction on the simulated ledger or your own simnet node, and find the guides, concepts and reference.
---

# HardKAS documentation

HardKAS is a local-first development environment for Kaspa L1 transactions. It
plans, signs, sends, observes and verifies transactions as files you can check
afterwards (artifacts), on a simulated ledger, on a `rusty-kaspad` simnet node of
your own, or on testnet-10 behind an explicit opt-in.

> [!WARNING]
> **Mainnet is locked down:** no keys, no connection, no broadcast. HardKAS
> verifies a mainnet artifact offline only, and no flag or setting changes that.

## Why it is built this way

Sending a transaction straight to a node and hoping it lands
(`request → mutation → hope`) leaves little to check when something goes wrong.
HardKAS splits the lifecycle into steps, and each step writes an artifact with a
content hash and a link to the step before it
(`intent → artifact → verify → execute → replay`):

1. `hardkas tx plan` builds the transaction with the official `kaspa-wasm`
   Generator and writes a plan. No key is used.
2. `hardkas artifact inspect` and `hardkas artifact verify` check the plan before
   any key touches it.
3. `hardkas tx sign` writes a signed transaction linked to its plan.
4. `hardkas tx send` executes it: the simulated ledger writes a `TxReceipt`; a
   node send writes a `TxSubmission`, what the node answered at that instant.
5. `hardkas tx wait` and `hardkas tx status` derive the state from what the node
   was seen to do, `hardkas artifact verify --network` checks the artifact
   against the node, and `hardkas replay verify` replays a simulated run.

## What HardKAS is, and is not

It is:

- A CLI (`@hardkas/cli`) and a TypeScript SDK (`@hardkas/sdk`) that work on the
  same workspace: a `hardkas.config.ts` and a `.hardkas/` folder.
- An artifact store: plans, signed transactions, receipts, submissions and
  observations, each identified by its content hash, with its lineage.
- Three places to run the same lifecycle: the simulated ledger (no node, never
  network evidence), a simnet node in Docker (`rusty-kaspad` v2.1.0, pinned by
  digest), and testnet-10 for teams that hold test funds (experimental).
- SilverScript (the pinned `silverc` v1.0.0) and Toccata covenants on a node,
  plus experimental ZK and KCC-20 tools.
- Test helpers for vitest (`@hardkas/testing`).

It is not:

- **A Kaspa node.** It implements no consensus: the node decides whether a
  transaction is valid.
- **A wallet or custody software.** Its keys are development keys.
- **A bridge.** It makes no deposits, withdrawals or custody, trustless or
  otherwise.
- **Evidence when simulated.** The simulated ledger runs no Kaspa script; only a
  real node's answer counts.

The claim values of this release are generated from the code:
[Release Claims](./status/claims.generated.md).

## Install

- [Install HardKAS](./start/installation.md): Node.js 24.22.1, the packages, `hardkas init`, `hardkas doctor`.
- [Configuration](./start/configuration.md): what `hardkas.config.ts` declares.

## Getting started

- [5-Minute Quickstart](./start/quickstart.md): plan, sign and send on the simulated ledger, CLI and SDK. No Docker.
- [Your first transaction](./start/first-transaction.md): what each step does, proves and does not prove.
- [Build on your own simnet](./start/build-on-simnet.md): the real-node path, in order:
  [Run your own simnet node](./start/simnet-node.md) →
  [Quickstart: a real transaction](./start/quickstart-simnet.md) →
  [SilverScript and covenants](./start/silverscript-covenants.md) →
  [Reading receipts and verification levels](./start/receipts-and-levels.md) →
  [What works in this release](./start/what-works.md) →
  [Common errors and recovery](./start/common-errors.md).
- [Browser wallets (experimental)](./start/browser-wallets.md).
- The book chapters: [Install and init](./start/install-and-init.md) and [Your first scenario](./start/first-scenario.md).

## Guides

- [CLI guide](./guides/cli.md) and [SDK guide](./guides/sdk.md).
- Testing: [Your first test](./guides/your-first-test.md), [Tasks](./guides/tasks.md) and [Testing Kaspa covenants](./guides/testing-kaspa-covenants.md).
- Accounts and transactions: [Accounts](./guides/accounts.md), [Plan, sign, send and observe](./guides/transactions/plan-sign-send.md) and [Fees, mass and UTXOs](./guides/transactions/fees-and-mass.md).
- [SilverScript and Toccata covenants](./guides/silverscript-covenants/index.md), the [SilverScript IDE](./guides/silverscript-ide-and-local-development.md) and [ZK verification on L1](./guides/zk-l1-verification-and-settlement.md).
- Evidence: [Artifact auditing](./guides/artifact-auditing.md), [Replay verification](./guides/replay-verification.md) and the [query store](./guides/query-store.md).
- [Runtime and Docker](./guides/runtime-docker.md), [Debugging](./guides/debugging.md) and [Operator commands](./guides/operator-commands.md).
- [Hardhat for Kaspa](./guides/hardhat-for-kaspa.md): coming from Ethereum tooling.
- [Build on Kaspa with AI](./ai/index.md): for coding agents.
- [HardKAS IDE](./ide/index.md): the desktop app.

## Concepts

- [Transaction lifecycle](./concepts/transaction-lifecycle.md)
- [Execution worlds](./concepts/execution-worlds.md)
- [Artifact lifecycle](./concepts/artifact-lifecycle.md): identity, lineage and what evidence proves
- [Accounts and wallets](./concepts/accounts.md)
- [Correct vs incorrect flows](./concepts/correct-vs-incorrect-flows.md)
- [Security model](./concepts/security-model.md)

## Reference

- [CLI reference](./reference/cli.md): generated from the command tree; do not edit it by hand.
- [SDK](../packages/sdk/README.md)
- [Artifact schema](./reference/artifact-schema.md)
- [Errors](./reference/errors.md): every code, its cause and its recovery
- [KCC-1, KCC-2 and KCC-20](./reference/kcc.md)

## Help

- [FAQ](./help/faq.md)
- [Common errors and recovery](./start/common-errors.md)
- [Troubleshooting](./guides/troubleshooting.md)
- [Limitations](./status/limitations.md)
- [Contributing: testing HardKAS itself](./contributing/testing.md)

## Status and versions

- [Release Claims (generated)](./status/claims.generated.md): authoritative.
  `pnpm docs:check-claims` fails when the committed copy drifts from the code.
- [What works in this release](./start/what-works.md): the same claims, by feature, with where each was checked against a real node.
- [Versioning](./status/versioning.md): the published packages and what is stable.
- [Migrating from 0.12 to 0.13](./migrations/0.12-to-0.13.md).

`docs/internal/` holds audit records kept locally; it is not user documentation.
