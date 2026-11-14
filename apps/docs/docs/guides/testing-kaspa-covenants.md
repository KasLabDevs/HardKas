---
title: Testing Kaspa Covenants with HardKAS
description: How to test SilverScript contracts and Toccata covenants with HardKAS, which layer proves what, and the commands and SDK calls that do it.
sidebar_label: Testing Covenants
sidebar_position: 3
---

# Testing Kaspa Covenants

A covenant on Kaspa L1 is a condition on a UTXO: it restricts who can spend it and, with Toccata (active on mainnet since 30 June 2026), what the spending transaction must create. This page explains which HardKAS layer can prove what about a covenant, and which commands and SDK calls to use.

The step-by-step walkthrough, with real output from a node, is [SilverScript and covenants on your simnet](https://github.com/KasLabDevs/HardKas/blob/main/docs/start/silverscript-covenants.md).

## Which layer proves what

| Layer | What it runs | What a pass proves | What it does not prove |
|---|---|---|---|
| Simulator (`network: "simulated"`) | A local UTXO ledger: synthetic accounts and txids | Your planning code, amounts and artifact flow | **Anything about a script.** The simulator does not execute Kaspa script: a covenant's conditions, signatures and timelocks are not evaluated there |
| Your own simnet node (`rusty-kaspad` 2.1.0 in Docker) | The real node's script engine and mempool rules | That this node accepted (or rejected) the exact transaction: the script ran, signatures and conditions were checked | Behaviour on a public network, fee markets, reorgs across many nodes |
| Testnet-10 (opt-in, test funds) | A public network | Acceptance by public nodes | Mainnet: HardKAS never signs, sends or connects there in this release |

Test covenant logic on a real simnet node. Use the simulator for the code around it.

## The commands

Compile with the pinned compiler, then deploy, spend and advance on your node:

```bash
npx hardkas toolchain install silverc
npx hardkas silver doctor --network simnet

# a signed contract (P2SH, transaction v0)
npx hardkas silver compile contracts/signed-release.sil --args contracts/owner.args.json --network simnet --out contracts/signed-release.compile.json
npx hardkas silver deploy contracts/signed-release.compile.json --from alice --amount 1 --network simnet --password-env HARDKAS_PASSWORD --wait
npx hardkas silver spend .hardkas/artifacts/silver/silverDeploy-<id>.json --entry release --to <address> --args contracts/release.args.json --password-env HARDKAS_PASSWORD --wait

# a covenant (Toccata, transaction v1)
npx hardkas silver covenant genesis contracts/counter.compile.json --from alice --amount 10 --compute-budget 10 --fee 1000000 --network simnet --password-env HARDKAS_PASSWORD --wait
npx hardkas silver covenant transition .hardkas/artifacts/silver/silverCovenant-<id>.json --policy bump ...
npx hardkas silver covenant inspect <covenantId> --network simnet

# check the evidence of every step
npx hardkas artifact verify .hardkas/artifacts/silver --recursive
```

A test that a covenant **refuses** something is a test that the node rejects a transaction. Build the transaction that breaks the rule, send it to your simnet node, and assert the rejection. The repository's node suites work this way (for example `packages/sdk/test/construction-vectors-node.simnet.test.ts`).

## From the SDK

The SDK's v1 engine is `sdk.covenants`:

- `planGenesis` / `planTransition`: create a covenant and advance it.
- `planContractDeploy` / `planContractSpend`: P2SH contracts on transaction v1.
- `check` / `sign` / `send`: check a plan against the node's rules, sign it, and send it.

Their options are in the [SDK reference](../reference/sdk/generated/sdk/src/classes/HardkasCovenants.md).

`sdk.covenants.planDeploy` and `planSpend` are **not** implemented: they throw `COVENANT_PLAN_UNSUPPORTED` and point to the calls above.

When a contract spend pays less than the input, say what happens to the rest. Either give `sweepTo` (the rest goes to that address) or set `maxFeeSompi` yourself. Without either, a spend whose remainder exceeds the default fee ceiling is refused instead of paying the remainder to the miner.

## Evidence

Every command above writes an artifact: a compile record, a deploy, spend or covenant record, plans, signed transactions and submissions.
- `hardkas artifact verify` checks each one offline.
- With `--url <node> --require consensus`, it also asks the node for the transaction's depth.

`hardkas replay verify` replays simulator runs only; it does not apply to these real-node records.

## Limits

- What a policy computes (a `require`, the conservation of amounts) is evaluated by the node, not by HardKAS before sending.
- Absolute lock times (`checkLockTime`) are not built by HardKAS. Relative timelocks (sequence locks) are, and HardKAS refuses to send one before it is met (`SEQUENCE_LOCK_NOT_YET_MET`).
- `silver test`, `silver debug` and `silver preflight` use the SilverScript runner, which upstream does not publish as a binary. A local build is labelled UNVERIFIED, and its verdicts are never a node's acceptance.

## Related

- [SilverScript & local development](./silverscript-ide-and-local-development.md)
- [Execution contracts & evidence](../concepts/execution-contract.md)
- [Kaspa documentation](https://docs.kaspa.org)
