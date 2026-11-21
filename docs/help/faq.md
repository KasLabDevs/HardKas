---
title: FAQ
description: Short answers about what HardKAS runs on, mainnet and testnet, evidence and replay, where files live, L2 and bridges, and using it from AI agents.
---

# FAQ

## What is HardKAS?

A local-first development environment for Kaspa L1 transactions: a CLI
(`@hardkas/cli`) and a TypeScript SDK (`@hardkas/sdk`) that plan, sign, send,
observe and verify transactions, and record each step as an artifact you can
check. See the [documentation home](../README.md).

## Do I need Docker or a Kaspa node?

Not to start. The [Quickstart](../start/quickstart.md) runs on the simulated
ledger, with no node and no Docker. A real node needs Docker: either the managed
localnet (`hardkas localnet start --toccata`) or a `rusty-kaspad` container of
your own ([Run your own simnet node](../start/simnet-node.md)).

## Which Node.js version?

Node.js 24.22.1 exactly. `hardkas doctor` passes on it, warns on another 24.x
and fails on any other major line ([Install HardKAS](../start/installation.md)).

## Can I use HardKAS on mainnet?

No. Mainnet is locked down in this release: no connection to a mainnet node,
reads included (`MAINNET_CONNECTION_DISABLED`), no signing
(`MAINNET_SIGNING_DISABLED`), no broadcast (`MAINNET_BROADCAST_DISABLED`), and
mainnet keys are refused at import and generation. No flag or setting enables
it. `hardkas artifact verify` checks a mainnet artifact offline only.

## Can I use testnet-10?

Yes, experimentally, if you hold testnet funds. The config needs
`experimental: true` and `network: { allowPublic: true }`, and a node endpoint
you choose: HardKAS never picks a public node for you
([Configuration](../start/configuration.md#a-public-testnet)).

## Is a simulated result evidence?

No. The simulated ledger (`network: "simulated"`) has synthetic accounts and
transaction ids and runs no node and no Kaspa script. Its records are never
network evidence: their network level is `NOT_CHECKED [SIMULATED_ARTIFACT]`.
`@hardkas/simulator`, the frozen in-memory node behind `hardkas simulator start`,
is an approximate model, not consensus-equivalent. Only a real node's answer
counts ([What works in this release](../start/what-works.md)).

## Does `tx send` wait for confirmation?

No. It returns once the node accepts the submit request (`SUBMITTED`), which says
nothing yet about the DAG. Wait with `hardkas tx wait <txId>`, or send with
`hardkas tx send --wait`. `CONFIRMED` means 100 blue-score confirmations, a
HardKAS policy, not a Kaspa parameter and not finality
([Reading receipts and verification levels](../start/receipts-and-levels.md)).

## Why can't I replay a transaction I sent to a node?

`hardkas replay verify` replays simulated runs only: HardKAS cannot rebuild a
node's past state. A node send records a `TxSubmission`, and the replay refuses
it (`REPLAY_MODE_UNSUPPORTED`). Check a node send with
`hardkas artifact verify --network simnet --require consensus` and
`hardkas tx status <txId>`.

## Where does HardKAS keep its files?

In the workspace's `.hardkas/` folder, which `init` adds to `.gitignore`:

- `artifacts/`: `plans/`, `signed/`, `receipts/` (receipts and submissions) and
  `observations/`;
- `localnet.json`: the simulated ledger;
- `accounts.real.json` and `keystore/`: your real development accounts and their
  encrypted keystores;
- `kaspad/`: the managed localnet's chain, in the workspace that started it;
- `store.db`: the query store, rebuilt from the artifacts.

Toolchains (`kaspa-wasm`, `silverc`) go to `~/.hardkas/toolchains/`; set
`HARDKAS_HOME` to use another folder.

## How do I start the localnet over from an empty chain?

`hardkas localnet reset` stops the managed node and its miner and removes only
this workspace's chain data (`.hardkas/kaspad`); the dev accounts, keys and
records stay. Then `hardkas localnet start --toccata`. It replaces the hidden,
deprecated `hardkas node reset`
([details](../start/simnet-node.md#stop-or-start-over-from-an-empty-chain)).

## Is HardKAS a wallet? Can it hold real funds?

No. It is developer tooling: its keys are development keys, and mainnet keys
are refused. Browser wallets (KasWare, Kastle, Kaspire) can sign for it, as an
experimental, unverified integration ([Browser wallets](../start/browser-wallets.md)).

## Does HardKAS support SilverScript and covenants?

Yes. It runs the pinned SilverScript compiler (`silverc` v1.0.0), and P2SH deploy
and spend and 1:1 covenant transitions (transaction v1, Toccata) were verified
against a real simnet node. 1:N, N:M and termination are experimental
([SilverScript and covenants](../start/silverscript-covenants.md)).

## What about ZK and vProgs?

The ZK tools are experimental and local; HardKAS claims no on-chain ZK
verification of its own (the node decides). vProgs is not active on Kaspa L1:
HardKAS only inspects vProgs artifacts.

## Does HardKAS support EVM, L2s or bridges?

Not in this release. Kaspa L1 runs no EVM. The Igra L2 packages (`@hardkas/l2`
and the L2 extension) are not published, and `@hardkas/bridge-local` is an
offline lab, not a bridge: HardKAS makes no deposits, withdrawals or custody.

## Can AI coding agents use HardKAS?

Yes. Point the agent at [Build on Kaspa with AI](../ai/index.md) (on the site,
`https://hardkas.dev/llms.txt`), and have it follow these rules:

- Check what is available first: the SDK's `capabilities.get()`,
  `hardkas doctor --json`, and `hardkas silver doctor --json` for SilverScript
  and covenants.
- Use `--json` and act on the stable error `code`, not on the message text.
- Stay on local networks: the simulated ledger and simnet.
- Never invent a txid, a balance or a confirmation: read them with
  `hardkas tx status <txId>` and `hardkas artifact verify`.
- Check flags with `hardkas <group> --help` or the [CLI reference](../reference/cli.md).

## Where are the error codes?

[Common errors and recovery](../start/common-errors.md) covers the ones met on
the simnet path; [Errors](../reference/errors.md) covers more, with each code's recovery.
