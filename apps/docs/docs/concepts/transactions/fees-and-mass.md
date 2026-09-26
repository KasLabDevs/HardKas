---
title: Fees, Mass & Change
sidebar_position: 4
---

# Fees, Mass & Change

During the planning phase, HardKAS calculates the exact geometric properties of the transaction. Because Kaspa requires fees to be determined *before* signing, this math must be strictly correct.

## Ownership of Math

The authority that calculates mass and fees depends entirely on the planner implementation (see [Planning](./planning.md)).

- **SDK Real-Node Path**: The upstream `kaspa-wasm Generator` acts as the definitive authority for mass and fee calculation based on network consensus parameters.
- **CLI / Simulator Path**: The internal HardKAS planner (`buildPaymentPlan`) estimates mass synthetically based on input/output counts (`marginFeePerInput`) and computes the fee against the requested `feeRate`.

*Note: Storage mass properties (where relevant for L2/Toccata) are handled dynamically by the respective planner.*

## Change Address

When a transaction consumes a UTXO, the entire amount must be spent. Any remainder that is not sent to the recipient or allocated to network fees is returned to the user as **Change**.

HardKAS enforces the following behavior regarding change outputs:

1. **Default Behavior**: If a change address is omitted in the intent, HardKAS automatically returns the change to the `from` address.
2. **Explicit Override**: You can explicitly specify a different `changeAddress` during planning (e.g., to rotate keys or route change to a cold wallet).
3. **Network Validation**: HardKAS validates that both the destination address and the change address belong to the targeted network (e.g., preventing a `mainnet` address from being used in a `simnet` transaction). If validation fails, the planner throws a synchronous error.

*(The strict behavioral rules for change addressing were stabilized during HardKAS Wave 13).*
