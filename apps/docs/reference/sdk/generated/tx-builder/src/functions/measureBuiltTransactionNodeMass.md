[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / measureBuiltTransactionNodeMass

# Function: measureBuiltTransactionNodeMass()

> **measureBuiltTransactionNodeMass**(`tx`, `storage`): [`BuiltTransactionNodeMass`](../interfaces/BuiltTransactionNodeMass.md)

Defined in: [packages/tx-builder/src/mass.ts:282](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L282)

G3 · the node's relay floor and mass limits of a transaction the caller has built as a WASM `Transaction`, for a
minimum fee and a refusal that are the node's, not the SDK's.

[measureBuiltTransactionMass](measureBuiltTransactionMass.md) prices the SDK's max(compute, storage) mass: when storage mass binds (a small
output) its minimum fee is far above what the node requires, and its `standard` flag refuses storage mass above
100,000 g, where the node's limit is the block's 500,000 g. Proven on rusty-kaspad 2.1.0 (simnet,
silver-v0-node-floor-g3.simnet.test.ts): v0 transactions with storage mass 125,000 g (P2PK) and 395,886 g (a two-
signature P2SH spend) are accepted at 100 sompi/g of the compute mass and refused one sompi under it; storage mass
703,499 g is refused ("larger than max allowed size of 500000"). HK-09 certified the same floor for a v0 payment.

The masses are the node's (v1-mass.ts, term by term: the v0 sig-op count at 1000 g, v1 compute budgets at 100 g),
read from the transaction's own fields: its signature scripts must be at their FINAL length (fill unsigned P2PK
inputs with a 66-byte placeholder), unlike [measureBuiltTransactionMass](measureBuiltTransactionMass.md), which adds a signature per input. The
storage mass is given: the spent and created cells (KIP-9 with the Toccata plurality, [v1StorageMass](v1StorageMass.md)), or the
value already computed by that rule. Nothing is signed or rounded up: the fee is the node's floor, exactly.

## Parameters

### tx

`unknown`

### storage

\{ `inputs`: readonly [`V1StorageCell`](../interfaces/V1StorageCell.md)[]; `outputs`: readonly [`V1StorageCell`](../interfaces/V1StorageCell.md)[]; \} \| \{ `storageMass`: `bigint`; \}

## Returns

[`BuiltTransactionNodeMass`](../interfaces/BuiltTransactionNodeMass.md)
