# Covenant Genesis & Transition

This guide demonstrates how to orchestrate a 1:1 auth-bound Toccata covenant using HardKAS CLI.

*Prerequisites: You must have a compiled SilverScript record (`compile_record.json`) and a funded account (`alice`).*

## 1. Covenant Genesis

The Genesis step binds a new UTXO to a freshly derived `covenant_id`.

```bash
hardkas silver covenant genesis compile_record.json \
  --from alice \
  --amount 5000 \
  --compute-budget 50000 \
  --fee 20000000 \
  --wait
```

**What HardKAS does:**
1. Loads your compiled SilverScript artifact.
2. Derives the P2SH Kaspa address for the contract's initial state.
3. Finds a spendable UTXO from `alice` larger than the requested amount + fee.
4. Constructs a `v1` Kaspa transaction.
5. Explicitly assigns a new `covenant_id` to the output (Output Covenant Binding).
6. Submits the transaction to the network and waits for confirmation.

## 2. State Transition

To advance the covenant's state, you must spend the Genesis UTXO and create a Successor UTXO, satisfying the SilverScript policy constraints.

```bash
hardkas silver covenant transition genesis_record.json \
  --policy "increment" \
  --constructor-args args.json
```

**What HardKAS does:**
1. Resolves the current state of the covenant from the `genesis_record.json`.
2. Compiles the *expected successor state* using `silverc`.
3. Constructs a `v1` transaction that spends the current covenant UTXO and creates the successor UTXO.
4. Automatically copies the exact same `covenant_id` from the input to the successor output via bindings.
5. Signs the transaction (using standard or PSKT coordination if required) and submits it.

## PSKT Covenant Compatibility

HardKAS `pskt` workflows (delegating to upstream `rusty-kaspa` v2.1.0) are fully compatible with Toccata covenants. 

When you export a covenant transition plan to a PSKT, the PSKT binary preserves:
* The `v1` transaction serialization format.
* The explicit `compute_budget` required for the script validation.
* All Output Covenant Bindings and `covenant_id` metadata.

This allows you to construct a complex SilverScript state transition on an online machine, and safely transfer it to an air-gapped signer for authorization.
