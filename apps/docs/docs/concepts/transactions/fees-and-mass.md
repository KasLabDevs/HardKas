---
title: Fees, Mass & Change
sidebar_position: 4
---

# Fees, Mass & Change

During the planning phase, HardKAS calculates the exact geometric properties of the transaction. Because Kaspa requires fees to be determined *before* signing, this math must be strictly correct.

## Ownership of Math

The pinned `kaspa-wasm` Generator calculates mass and fee on every surface, CLI and SDK, simulator and real node (see [Planning](./planning.md)):

- **Fee**: the requested `feeRate` (sompi per gram) times the transaction's compute mass, never below the network minimum.
- **Storage mass (KIP-9)**: small outputs make a transaction non-standard. When the change a payment would leave is too small for a standard output, the plan is refused (`CHANGE_BELOW_STANDARD_OUTPUT`: adjust the amount, or send the whole balance); the remainder is not turned into fee. A payment output that is too small is refused as `OUTPUT_BELOW_STANDARD_AMOUNT`.

## Change Address

When a transaction consumes a UTXO, the entire amount must be spent. Any remainder that is not sent to the recipient or allocated to network fees is returned to the user as **Change**.

HardKAS enforces the following behavior regarding change outputs:

1. **Default Behavior**: If a change address is omitted in the intent, HardKAS automatically returns the change to the `from` address.
2. **Explicit Override**: You can explicitly specify a different `changeAddress` during planning (e.g., to rotate keys or route change to a cold wallet).
3. **Network Validation**: HardKAS validates that both the destination address and the change address belong to the targeted network (e.g., preventing a `mainnet` address from being used in a `simnet` transaction). If validation fails, the planner throws a synchronous error.

*(The strict behavioral rules for change addressing were stabilized during HardKAS Wave 13).*
