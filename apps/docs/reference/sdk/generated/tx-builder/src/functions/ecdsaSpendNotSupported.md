[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / ecdsaSpendNotSupported

# Function: ecdsaSpendNotSupported()

> **ecdsaSpendNotSupported**(`what`, `address?`): [`GeneratorPlanError`](../classes/GeneratorPlanError.md)

Defined in: [packages/tx-builder/src/address-scheme.ts:47](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/address-scheme.ts#L47)

The typed refusal of a spend from an ECDSA address where it is still not supported (what spends: "the sender",
"input 0"…). ECDSA spends: a payment from an ECDSA account is planned and signed on a real network; consolidations,
the simulator, v1 transactions, PSKT, multisig and P2SH-wrapped ECDSA keep this refusal.

## Parameters

### what

`string`

### address?

`string`

## Returns

[`GeneratorPlanError`](../classes/GeneratorPlanError.md)
