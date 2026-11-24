---
title: Fees, mass and UTXOs
description: Where a HardKAS plan gets its UTXOs, how the Generator prices mass and fee, the fee limits, change rules, and what to do with a fragmented wallet.
---

# Fees, mass and UTXOs

A Kaspa transaction's fee is fixed before it is signed, so HardKAS settles inputs, mass, fee and change at plan time.
The pinned `kaspa-wasm` Generator does that work on every surface (CLI and SDK, simulator and node); this page
explains what it is given and what HardKAS refuses around it. The step-by-step flow is in
[Plan, sign and send a transaction](./plan-sign-send.md).

## Where the UTXOs come from

- **Simulated ledger** (`--network simulated`): the synthetic UTXOs recorded in `.hardkas/localnet.json`.
- **Node** (`simnet`, `devnet`, `testnet-10`): the sender's UTXOs as the node lists them over wRPC.

The Generator takes the UTXOs in the order it is given them; HardKAS adds no coin-selection policy of its own. The SDK
puts a node's spendable outputs in one canonical order (by outpoint) before planning, so the same state always gives
the same plan. The CLI's `tx plan` hands them over in the order the node lists them.

A sender whose UTXO list is larger than one node answer may carry is refused (`RPC_RESPONSE_TOO_LARGE`), never read
partially.

## What is left out before planning (on a node)

**HardKAS safety filtering is not Kaspa consensus validation.** These checks protect a local workflow; the node still
decides.

1. **Immature coinbase outputs.** A coinbase output becomes spendable only after the network's coinbase maturity (in
   DAA score) plus a HardKAS margin of 10 DAA. Without the node's virtual DAA score no coinbase output is used.
2. **Pending spends.** Outputs a transaction in the node's mempool is already spending are left out, from one mempool
   observation taken with the UTXO read and recorded in the plan (`metadata.pendingSpendEvidence`). If every output is
   pending the plan is refused (`PENDING_SPEND_ALL_EXCLUDED`); if the mempool cannot be read it is refused too
   (`PENDING_SPEND_EVIDENCE_UNAVAILABLE`), never planned blind.
3. **Covenant UTXOs.** A payment never spends a covenant's UTXO.
4. **Selected-input re-check (CLI).** At the end of each attempt every selected input must still be in the address's
   UTXO set and not spent in the node's mempool; otherwise the CLI plans again, and after the bounded retries fails
   with `SELECTED_UTXO_INVALIDATED`. Blocks arriving during planning never invalidate a plan: the virtual state before
   and after is recorded in `metadata.planningWindow` as evidence only.

"Not in this node's mempool" never means "no competing spend exists on the network": a competing spend can still
appear before the transaction is sent, and the node then refuses it.

**Finding funds is not holding keys.** HardKAS can plan from any address whose UTXOs it can read; signing still needs
the key ([Accounts](../accounts.md)).

## Mass and fee

- **Fee rate.** `--fee-rate <sompiPerMass>` (SDK: `feeRate`, a `bigint`) is whole sompi per gram. The default is 1 on
  the simulator and the node's fee estimate on a node. A node's estimate is bounded by `networks[<net>].maxFeeRate`
  (default 10,000 sompi per gram): above it the plan is refused (`FEE_RATE_ABOVE_BOUND`).
- **The relay minimum.** At or below 100 sompi per gram (the relay minimum) the transaction pays the minimum relay
  fee, charged on its compute mass. A higher rate buys mempool priority and is charged on the larger of the compute
  and storage mass.
- **Storage mass (KIP-9).** Small outputs make a transaction heavy in storage mass and non-standard. The Generator
  folds dust change into the fee; any larger change that is still too small for a standard output makes the plan
  refused (`CHANGE_BELOW_STANDARD_OUTPUT`: change the amount, or send the whole balance). A payment output that is too
  small is refused as `OUTPUT_BELOW_STANDARD_AMOUNT`.
- **One transaction.** If the inputs needed do not fit in one standard transaction the plan is refused
  (`MULTI_TRANSACTION_PLAN_REQUIRED`). See [Fragmented wallets](#fragmented-wallets) below.

`hardkas tx profile plan.json` shows a plan's mass and fee breakdown.

## Fee limit

Every transaction's total fee is within a limit, checked at plan, sign and send (`FEE_EXCEEDS_MAX` above it):

- `--max-fee <sompi>` (SDK: `maxFeeSompi`, recorded in the plan) and the workspace's `networks[<net>].maxFeeSompi`;
  when both are set the lower one applies;
- with neither, HardKAS's default limit: 10,000,000 sompi (0.1 KAS), the minimum relay fee of a transaction at the
  maximum standard mass. Every transaction that pays the minimum fits under it; paying more needs an explicit limit.

## Change

A transaction spends its inputs whole; whatever is not paid out or paid as fee returns as change.

- **Default:** the change goes back to the sender.
- **Explicit:** `--change <account-or-address>` (SDK: `changeAddress`) sends it elsewhere, for example a fresh
  address.
- **Checked like the recipient:** the change destination is resolved like `--to`, and an address of another network
  is refused (`ACCOUNT_NETWORK_MISMATCH`).

## Fragmented wallets

A wallet holding thousands of small outputs (mining rewards, for example) cannot pay a large amount in one standard
transaction: the plan fails with `MULTI_TRANSACTION_PLAN_REQUIRED`. Consolidate it first:

```bash
hardkas accounts consolidate <account> --network simnet --dry-run
hardkas accounts consolidate <account> --network simnet --execute --yes --password-env <VAR>
```

`accounts consolidate` takes the account's outputs smallest first, in batches of `--batch-size` inputs (default 256,
at most 512), each batch one transaction to the account's own address, until `--target-utxos` outputs are left
(default 20). Without `--execute` it only estimates the batches; `--execute` needs `--yes` on every network. A batch
that is still too heavy for one transaction fails with `MULTI_TRANSACTION_PLAN_REQUIRED`: use a smaller
`--batch-size`.

<!-- qualification: mempoolContamination -->
