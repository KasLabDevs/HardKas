---
title: "Kaspa Testnet-10 with HardKAS (experimental opt-in)"
sidebar_label: "Testnet-10 (experimental)"
description: "How to point HardKAS at Kaspa Testnet-10 with test funds: the explicit opt-in, an account, funding from a faucet, browser wallets, and what was exercised."
---

# Kaspa Testnet-10 (experimental)

HardKAS can plan, sign and send on Kaspa Testnet-10, the public test network, behind an explicit, experimental opt-in
and with test funds only. Its release claims are proven on a local simnet: Testnet-10 use is not claimed as ready, and
mainnet stays locked whatever the configuration says.

Get your workflow working on your own simnet node first ([Run your own simnet node](simnet-node.md)), then move it to
Testnet-10 to see it on a public network.

## 1. Opt in

A public testnet needs two settings together, `experimental: true` and `network: { allowPublic: true }`, and a node
you choose: HardKAS never picks a public node for you. To make Testnet-10 the workspace's default target:

```ts
export default {
  execution: { default: "tn10", targets: { tn10: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
  networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "<your Testnet-10 node>" } },
  network: { allowPublic: true },
  experimental: true
};
```

`allowPublic` without `experimental` is refused when the config loads (`HARDKAS_CONFIG_ERROR`). The other fields are in
[Configuration](configuration.md#a-public-testnet).

## 2. Make an account

```bash
export PW=<keystore password>
hardkas accounts real generate --name tn-payer --network testnet-10 --password-env PW
```

The key is encrypted in `.hardkas/keystore/`. To use a key you already have, import it with
`hardkas accounts real import --network testnet-10` (with the options of the command); a `kaspatest:` address needs that flag
([Accounts](../guides/accounts.md)). A mainnet network or address is refused.

## 3. Fund it

HardKAS has no Testnet-10 faucet: `hardkas localnet fund` mines on your local node only. Send test KAS to the
account's `kaspatest:` address from a Testnet-10 faucet ([kaspa.org/build](https://kaspa.org/build) links to one).

## 4. Send and check

Plan, sign and send as on simnet ([Plan, sign and send a transaction](../guides/transactions/plan-sign-send.md)), on
`testnet-10` (the default target above, or `--network testnet-10`). Then follow the transaction with
`hardkas tx status <txId>` and check its records with `hardkas artifact verify`
([Reading receipts and verification levels](receipts-and-levels.md)).

## Browser wallets

KasWare, Kastle and Kaspire can sign for HardKAS on Testnet-10, as an experimental integration. On 21-nov-2026 the probe
page was run against the real extensions on Testnet-10: payments were signed through KasWare and Kaspire, and messages
through all three ([Browser wallets](browser-wallets.md)).

## What was exercised on Testnet-10

With 0.13.0-rc.1 from npm, against a public Testnet-10 node: payments, a batch, a consolidation, a double spend (the
second rejected by the node), SilverScript deploy and spend, covenants and an escrow. The details, and what is verified
only on simnet, are in [What works in this release](what-works.md).

## What stays off

- **Mainnet** is locked down: no connection to a mainnet node, reads included (`MAINNET_CONNECTION_DISABLED`), no
  signing and no broadcast. `allowPublic` does not lift it.
- HardKAS makes no claim that Testnet-10 behaves like mainnet, and the boundaries of this release are listed in
  [Limitations and Boundaries](../status/limitations.md).
