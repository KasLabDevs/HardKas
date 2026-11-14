---
title: What works in this release
description: Which HardKAS features are verified against a real rusty-kaspad node and on which network, which are experimental or unverified, and which are not supported.
url: /capabilities
---

# What works in this release

A plain table for a team deciding what to build on. The authoritative claim
values are generated from the code in [Release Claims](../status/claims.generated.md);
this page explains them by feature and says where each one was checked against
a real node.

Two different things appear side by side:

- **What Kaspa L1 does**: the consensus rules of the node (`rusty-kaspad`),
  which HardKAS does not reimplement and does not replace.
- **What HardKAS does**: planning, signing, records, observation and checks
  around those rules. "Verified" below means a real `rusty-kaspad` v2.1.0
  (pinned by digest) accepted or refused what HardKAS built, with the expected
  result. A simulator result never counts.

> [!WARNING]
> **Mainnet: NO-GO, locked down.** No connection to a mainnet node at all (reads
> included, even to an endpoint you declare), no signing, no broadcast
> (`MAINNET_CONNECTION_DISABLED`, `MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`;
> no flag or setting enables them); mainnet artifacts are verified offline only. **Testnet-10:** only for teams that hold testnet
> funds, behind an explicit opt-in. Payments, contracts and covenants were exercised there with `0.13.0-rc.1`, and ZK
> locks with the `0.13.0-rc.2` candidate (see Experimental below); not every command was. **vProgs** is not
> active. **No trustless bridge** exists in HardKAS.

## Verified against a real node

| Feature | What Kaspa L1 does | What HardKAS does | Verified on |
| :-- | :-- | :-- | :-- |
| Payment (transaction v0): plan, sign, send | validates the spend, its signatures, mass and fee | plans with the official `kaspa-wasm` Generator, signs (Schnorr), records plan, signed transaction and submission | simnet (this guide); devnet (own node) |
| No double send | refuses a second spend of the same outputs | `tx send` sends a recorded or already-seen transaction no second time (`ALREADY_SUBMITTED`) | simnet |
| Waiting and status (`tx wait`, `tx status`) | virtual chain, blue score, DAA score | derives `SUBMITTED` … `CONFIRMED` from recorded observations; the 100 blue-score depth is HardKAS's policy | simnet, devnet |
| `artifact verify` in three levels | — | integrity offline on every network; network and consensus levels from a node of the artifact's own network | simnet, devnet; testnet-10 read-only; mainnet offline only |
| Coinbase maturity | rewards spendable 1,000 DAA after their block on simnet | planning skips immature outputs (`NO_SPENDABLE_UTXOS`) | simnet (999 refused, 1,000 accepted), devnet |
| Paying to an ECDSA address | standard ECDSA output script | builds the output | simnet |
| Relative time lock (input sequence, CSV) | enforces it | `silver spend --sequence` | simnet (`silver.p2sh.relative-timelock.v1`) |
| SilverScript compile | — | runs the official `silverc` v1.0.0 (pinned by SHA-256), records provenance, reproduces it (`silver verify`) | offline |
| SilverScript P2SH deploy and spend (transaction v0) | executes the contract script | funds the P2SH output, builds and signs the entry call | simnet (this guide), devnet |
| Covenant 1:1 genesis and transition (transaction v1, Toccata) | covenant ids, transaction v1 rules | `silver covenant genesis`, `silver covenant transition`, lineage (`silver covenant inspect`) | simnet (this guide), devnet |
| Encrypted development keystores | — | `accounts real generate/import`, encrypted by default; development keys, not a wallet | simnet |
| SDK payment flow | same as the payment above | `tx.plan`, `tx.sign`, `tx.send`, `tx.waitForConfirmations` | simnet (this guide) |
| `hardkas doctor` against your configured node | reports its network, version and sync (`getServerInfo`) | one bounded read of the workspace's node (or `--url`/`--network`): local config, connectivity, network identity, sync and capability, each with a typed code | simnet, devnet; testnet-10 read-only (with the payments' opt-in) |

## Experimental

| Feature | Status |
| :-- | :-- |
| Covenants 1:N, N:M and termination; the KCC-20 example transfer | Built by the SDK's v1 engine only (no `silver covenant` command); accepted by a real simnet node in the repository's node suite, and every invalid shape the engine refuses the node refused too. Exercised on Testnet-10 with 0.13.0-rc.1 from npm (1:3, 2:1, 2:2 transitions, a time-locked escrow, a KCC-20 transfer; the attack cases were rejected by the node). |
| Covenant policy logic (a `require`, amount conservation) | Not evaluated by HardKAS before sending: the node decides and refuses a violation. |
| Testnet-10 transactions | Behind `experimental: true` and `network.allowPublic: true`. Exercised with 0.13.0-rc.1 from npm against a public Testnet-10 node: payments, a batch, a consolidation, a double spend (the second rejected by the node), SilverScript deploy and spend, covenants and the escrow above. Test funds only; the transaction ids are in the [evidence index](../community/rc-0.13.0-rc.1/EVIDENCE_INDEX.md). |
| The simulated ledger (`network: "simulated"`) | A local UTXO ledger for the development loop (`@hardkas/localnet`, kept in `.hardkas/localnet.json`): synthetic accounts and transaction ids, no node and no script execution. Never network or consensus evidence. It is not `@hardkas/simulator`, the frozen in-memory node behind `hardkas simulator start`, whose known divergences (the UNVERIFIED `WrongMass` rule among them) are in [Limitations](../status/limitations.md#the-simulator-is-an-approximate-model). |
| ZK: Groth16 math check of local fixtures, RISC Zero inspection | Local and experimental; needs the optional `snarkjs` (GPL-3.0). |
| ZK: RISC Zero Groth16 locks and spends for Toccata (`OpZkPrecompile`) | Experimental. HardKAS builds the lock and its spend (kaspa-wasm's `ZkScriptBuilder`, `buildR0Groth16Transaction`) and has no command that broadcasts them; the verdict is the node's. In the repository's node suites (rusty-kaspad v2.1.0 in Docker, also in CI on Linux) the node accepted a valid spend (proof-only and proof-and-output-bound) and rejected every tampered one: altered proof or journal, truncated proof, v0 transaction, compute budget or fee too low, wrong payout script or amount, two inputs, an input above the bound. Exercised on Testnet-10 on 2026-11-13 with the 0.13.0-rc.2 candidate and a receipt HardKAS made itself (`fixtures/toccata-v2/zk/r0-groth16-hardkas`): proof-and-output-bound locks funded with test funds and spent to their bound payout, and a second run with the whole node-suite matrix (a proof-only lock and an output-bound lock: 11 invalid spends rejected by the node, 7 transactions confirmed); see the [evidence index](../community/rc-0.13.0-rc.1/EVIDENCE_INDEX.md). Since then that receipt is public too: for a program whose receipts are published (the official vector and HardKAS's own), HardKAS builds no proof-only lock on a public network (anyone could spend it) and builds proof-and-output-bound locks with a warning that anyone can trigger the bound payout. Mainnet is refused. HardKAS claims no on-chain ZK verification of its own. |
| Query store, replay, dev-server and dashboard | Local projections and views of the workspace; replay is for simulated records only. |

## Not verified

| Feature | Why |
| :-- | :-- |
| SilverScript runner (`silver test`, `silver debug`, `silver preflight` at `SCRIPT_VM`) | Upstream publishes no runner binary; a local build is labelled UNVERIFIED and needs `--allow-unverified-runner`. Its verdicts are never a node's acceptance. |
| Linux and macOS | CI runs the hermetic test gate on Linux, Windows and macOS; the node suites run in CI on Linux only, and the manual and Testnet-10 runs were on Windows 11 x64 only. |

## Not supported

| Feature | What Kaspa L1 does | HardKAS |
| :-- | :-- | :-- |
| Mainnet signing and broadcast | — | refused by policy (`MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`, `SILVERSCRIPT_MAINNET_NOT_ENABLED`), offline signing included |
| Reading from a mainnet node | serves its state over RPC | refused (`MAINNET_CONNECTION_DISABLED`): no command and no SDK path connects to mainnet, not even to an endpoint you declare; an endpoint declared as another network whose node answers mainnet is closed after that one identity answer. Mainnet artifacts are verified offline only |
| Absolute lock time (CLTV, `lockTime ≠ 0`) | supports it | never builds one |
| Spending from an ECDSA address | supports it | the signer is Schnorr-only (paying to one works) |
| Transaction v1 for plain payments | supports it | payments, batches and consolidations stay v0 by design |
| L2 (Igra) and bridges | — | `@hardkas/l2` and the L2 extension are not published; `@hardkas/bridge-local` is an offline lab, not a bridge |
| vProgs execution | not active on Kaspa L1 | inspection of vProgs artifacts only |
| On-chain ZK verification | — | not claimed |
| Native PSKT addon (`@hardkas/pskt-native`) | — | not published |
| Custody, production wallets | — | not a goal: development keys only |

## Where the evidence comes from

- **This guide**: every command of [Build on your own simnet](./build-on-simnet.md)
  was run as written against an own `rusty-kaspad` v2.1.0 simnet node, with the
  packages installed from this release's tarballs.
- **The repository's node suites** (`pnpm test:simnet`, `pnpm gauntlet:toccata`)
  start their own simnet nodes in Docker; the golden corpus in
  `fixtures/toccata-v2/silver` holds node evidence per SilverScript capability.
- **Release validation** ran the same payment, deploy → spend and genesis →
  transition on an own devnet node, and read earlier testnet-10 records back
  from a public testnet-10 node without sending anything.

Each network has its own evidence: simnet does not prove devnet, testnet-10 or
mainnet.
