---
title: Transaction v1 and the compute budget
description: Toccata's transaction v1, covenant bindings and compute budgets, which HardKAS commands build v1, and how they set the budget and the fee.
---

# Transaction v1 and the compute budget

Toccata introduced a new transaction version, v1. Covenant bindings and compute budgets exist only in v1, so covenants and
ZK spends are v1 transactions.

## What v1 adds

- **Covenant bindings on outputs.** A v1 output can carry a binding: the `covenant_id` it belongs to and the index of its
  authorizing input ([the covenant model](./covenant-model.md#covenant-ids)). Do not confuse the binding with the id: the
  binding is the transaction-level pointer, and the output's script still validates the transition.
- **A compute budget per input.** Each v1 input declares how much script execution it may use. It replaces the legacy
  `sig_op_count`, which prices only signature operations.

What a v1 transaction id and hash commit to is a consensus rule of rusty-kaspa. One property matters in practice: a Kaspa
txid does not cover the signature scripts, so two spends of one outpoint to the same outputs have the same txid whatever
their signature scripts carry (see the ZK guide's
[two properties to keep in mind](../zk-l1-verification-and-settlement.md#6-what-a-node-has-decided-about-these-locks)).
A HardKAS `artifactId` identifies a HardKAS record; the network knows the transaction by its txid.

## Compute pricing

Kaspa compute is not "gas". The parts are distinct:

1. **Compute budget.** Declared per v1 input, `0` to `65535`. A budget of `b` allows `b × 10,000 + 9,999` script units for
   that input.
2. **Script units.** What executing opcodes costs: verifying a signature, hashing, running `OpZkPrecompile` (the Groth16
   precompile alone costs 14,000,000 script units).
3. **Mass.** The transaction's weight, in grams: compute mass (its size and scripts; in v0 its signature operations, in v1
   100 grams per unit of declared compute budget) and storage mass (KIP-9). A transaction whose compute mass exceeds the
   block limit of 500,000 grams cannot be mined.
4. **Fee.** In sompi, paid to the miner for inclusion.

Fee policy is not consensus validity:

- **Consensus.** A script that needs more script units than its input's budget allows makes the transaction invalid: the
  node rejects it.
- **Mempool policy.** A node may require a minimum fee for the transaction's mass before it relays it. That is a local
  policy, not a consensus rule.

`hardkas zk toccata rules --json` prints the figures HardKAS relies on for the ZK precompile (costs, budget rules, block
limit).

## Which commands build v1

| Command | Transaction | `--compute-budget` | `--fee` |
| :--- | :--- | :--- | :--- |
| `hardkas silver covenant genesis`, `start` | v1 | Default: the certified P2PK budget of the funding inputs | Default: the node's floor |
| `hardkas silver covenant transition`, `advance` | v1 | Default: the certified budget of the entry, else `estimate` | Default: the node's floor (`transition` pays it from the covenant's value) |
| `hardkas silver spend --tx-version 1` | v1 | Default: the certified budget of the entry, else `estimate` | No option |
| `hardkas silver deploy --tx-version 1` | v1 | No option | No option |
| `hardkas silver engine plan` (and `sdk.covenants`) | v1 | From the SDK options in the spec | From the SDK options in the spec |
| `hardkas kcc20 transfer` (experimental) | v1 | Default: `estimate` | Default: the node's floor |
| `hardkas kcc20 deploy` (experimental) | v1 | No option | Default: the node's floor |
| `hardkas zk toccata spend` (experimental) | v1 | Default: 1600 | Proof-only: the recommended fee for the measured spend; output-bound: fixed by the lock |
| `hardkas silver deploy`, `hardkas silver spend` (default) | v0 | — | — |
| `hardkas tx plan`, `hardkas tx send`, batches, consolidations | v0 | — | — |

`estimate` is rusty-kaspa's upper bound for the input. A fee below the node's floor is refused. Payments stay v0 by
default: v1 is used only where covenants, contracts with `--tx-version 1`, KCC-20 or ZK need it.

## Signing v1

`sdk.tx.sign()` signs a v1 plan for a node network with the managed kaspa-wasm, and the v1 commands above sign with local
accounts. The SDK's simulated mode does not take v1 plans (`TX_V1_SIMULATION_UNSUPPORTED`).

This build has no working PSKT adapter: a v1 transaction cannot be exported as a PSKT for an offline signer. When several
parties must sign one v1 plan, `hardkas silver engine draft` prepares a draft, each party signs its own slots
(`hardkas silver engine draft sign`), and the drafts are combined and finalized; the result is sent with `hardkas tx send`.
It is a HardKAS draft format, not a PSKT.

## Related

- [Covenant genesis and transition](./covenant-genesis-and-transition.md)
- [ZK primitives and sequencing](./zk-and-sequencing.md)
- [Transaction version compatibility](../../status/tx-version-compatibility.md)
- [`hardkas silver engine` in the CLI reference](../../reference/cli.md#hardkas-silver-engine)
