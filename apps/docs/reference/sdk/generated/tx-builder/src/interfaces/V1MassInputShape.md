[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1MassInputShape

# Interface: V1MassInputShape

Defined in: [packages/tx-builder/src/v1-mass.ts:47](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-mass.ts#L47)

What the node measures of one input.

## Properties

### computeBudget?

> `readonly` `optional` **computeBudget?**: `number`

Defined in: [packages/tx-builder/src/v1-mass.ts:50](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-mass.ts#L50)

v1 inputs commit a compute budget (u16); v0 inputs a sig-op count.

***

### signatureScriptBytes

> `readonly` **signatureScriptBytes**: `number`

Defined in: [packages/tx-builder/src/v1-mass.ts:48](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-mass.ts#L48)

***

### sigOpCount?

> `readonly` `optional` **sigOpCount?**: `number`

Defined in: [packages/tx-builder/src/v1-mass.ts:51](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-mass.ts#L51)
