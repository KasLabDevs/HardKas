---
title: Covenant genesis and transition
description: The hardkas silver covenant commands, what each one does on the node, the 1:1 auth-bound form, and the experimental 1:N, N:M and termination forms.
---

# Covenant genesis and transition

HardKAS creates and advances Toccata covenants with `hardkas silver covenant`. Every command plans a transaction v1,
signs it with local accounts and sends it to a node you run. The step-by-step run of a counter covenant (7 → 12), with the
files it needs and the node's real output, is Part 2 of
[SilverScript and covenants on your simnet](../../start/silverscript-covenants.md#part-2--a-covenant-genesis-and-transition).

| Shape | Create | Advance | Status |
| :--- | :--- | :--- | :--- |
| 1:1, auth-bound | `hardkas silver covenant genesis` | `hardkas silver covenant transition` | Real-node corpus (simnet) |
| Several outputs, 1:N, N:M with delegates, termination | `hardkas silver covenant start` | `hardkas silver covenant advance` | Experimental, simnet suites |

Both pairs go through the SDK's v1 engine (`sdk.covenants`). Which shapes a contract allows is set by its
`#[covenant(...)]` declarations; the engine refuses a transition its declaration does not allow before any key is read.

You need a compiled record (`hardkas silver compile`, see [compile and verify](./compile-and-verify.md)) and a funded
account.

## 1. Genesis

```bash
hardkas silver covenant genesis contracts/counter.compile.json --from alice --amount 10 --compute-budget 10 --fee 1000000 --network simnet --password-env HARDKAS_PASSWORD --wait
```

What HardKAS does:

1. Loads the compile record and derives the P2SH address of the contract's initial state.
2. Selects spendable UTXOs of `alice` that cover the amount and the fee.
3. Builds a transaction v1 whose covenant output is bound to the covenant id the SDK derives from the authorizing input's
   outpoint and the outputs it authorizes ([covenant ids](./covenant-model.md#covenant-ids)).
4. Signs with `alice` and sends it. With `--wait` it waits for confirmation and records the id the node reports
   (`covenantIdFromNode`) next to the derived one.

`--compute-budget` (default: the certified P2PK budget) and `--fee` (default: the node's floor) are optional; the values
above are the ones the corpus proved on a real node. The record is written as
`.hardkas/artifacts/silver/silverCovenant-<id>.json`.

## 2. Transition (1:1)

```bash
hardkas silver covenant transition .hardkas/artifacts/silver/silverCovenant-<id>.json --policy bump --constructor-args contracts/counter.args.json --state-map contracts/counter.state-map.json --next-state contracts/counter.next-state.json --args contracts/bump.args.json --compute-budget 0 --emit-args contracts/counter.next-args.json --network simnet --password-env HARDKAS_PASSWORD --wait
```

What HardKAS does:

1. Resolves the covenant's current state from its record, and checks `--constructor-args` against it.
2. Compiles the successor state with silverc (`--next-state`, mapped onto the constructor parameters by `--state-map`).
3. Builds a transaction v1 that spends the current covenant UTXO and creates the successor, bound to the same covenant id.
   The fee comes out of the covenant's value.
4. Makes the signatures the entry's `--args` ask for (`{"kind":"signature","account":"<name>"}`) with those local
   accounts, and sends it. `--emit-args` writes the successor's constructor arguments, for the next transition.

`--lock-time-daa` / `--lock-time-ms` set an absolute lock time for an entry that requires one (see
[timelocks](./index.md#timelocks)). The node runs the script: a transition that breaks the policy (for the counter, a
`delta` of 0) is rejected by the node, not by HardKAS.

## 3. Several outputs and other shapes (experimental)

`start` creates a covenant with one or more outputs, each holding its own state, all bound to one covenant id:

```bash
hardkas silver covenant start <compile-record> --from alice --output <state-file>=<kas> --output <state-file>=<kas> --network simnet --wait
```

`advance` runs any transition the contract's declaration allows. Inputs are given in input order, the leader first; each
`--next` is a continuation in output order (`<state-file>=<kas>`, or one `<state-file>` that keeps what the other outputs
and the fee leave):

```bash
hardkas silver covenant advance <compile-record> --covenant <covenantId> --policy <name> --input <txid:index> --next <state-file>=<kas> --next <state-file> --args <file> --network simnet --wait
```

- **1:N**: one `--input`, several `--next`.
- **N:M**: several `--input` (the leader, then delegates, each with its `--delegate-args <file>`).
- **Termination**: `--terminate` with no `--next`; the covenant's value goes to the `--pay <address or account>=<kas>`
  outputs and the fee, if its policy allows it.
- **Payments out** of a covenant: `--pay`. **A separate fee payer**: `--funder <account>` (the covenant keeps its value).

These shapes are accepted by a real rusty-kaspad v2.1.0 on simnet, and their invalid variants refused, in the
repository's suites (`packages/cli/test/silver-covenant-topologies-cli.simnet.test.ts`,
`packages/sdk/test/covenant-topologies-node.simnet.test.ts`). They are not a corpus capability and have no testnet-10
evidence.

## 4. Inspect and verify

```bash
hardkas silver covenant inspect <covenantId> --network simnet
hardkas artifact verify .hardkas/artifacts/silver --recursive
```

`inspect` rebuilds the lineage from this workspace's records and checks the tip at the node
([following a covenant](./covenant-model.md#following-a-covenant)); `artifact verify` checks every record offline, and with
`--url <node> --require consensus` the transaction's depth on the node.

## Signing

The covenant commands sign with the workspace's local accounts (`--password-env` or `--password-stdin` for encrypted
keystores). This build cannot export a covenant transaction as a PSKT for an offline signer. A plan several parties sign
in turns goes through `hardkas silver engine draft` ([signing v1](./tx-v1-and-compute-budget.md#signing-v1)).

On a network other than simnet, each broadcast needs `--yes` (otherwise `TX_SEND_CONFIRMATION_REQUIRED`, nothing sent).
Mainnet is refused.

## Related

- [The covenant model](./covenant-model.md)
- [Testing Kaspa covenants](../testing-kaspa-covenants.md)
- [`hardkas silver covenant` in the CLI reference](../../reference/cli.md#hardkas-silver-covenant)
- [Covenants status](../../status/covenants-status.md)
