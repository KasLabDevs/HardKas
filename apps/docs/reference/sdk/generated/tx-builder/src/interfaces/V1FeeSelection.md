[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1FeeSelection

# Interface: V1FeeSelection

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:25](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-fee-inputs.ts#L25)

## Properties

### excluded

> `readonly` **excluded**: readonly `object`[]

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:29](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-fee-inputs.ts#L29)

Why each listed coin was left out (never chosen): "covenant", "immature" or "pending".

***

### selected

> `readonly` **selected**: readonly [`V1FeeCoin`](V1FeeCoin.md)[]

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:26](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-fee-inputs.ts#L26)

***

### totalSompi

> `readonly` **totalSompi**: `bigint`

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:27](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-fee-inputs.ts#L27)
