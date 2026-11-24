[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / UpstreamMassInput

# Interface: UpstreamMassInput

Defined in: [packages/tx-builder/src/mass.ts:62](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L62)

## Properties

### inputs

> `readonly` **inputs**: readonly `object`[]

Defined in: [packages/tx-builder/src/mass.ts:64](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L64)

***

### minimumSignatures?

> `readonly` `optional` **minimumSignatures?**: `number`

Defined in: [packages/tx-builder/src/mass.ts:77](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L77)

Signatures expected per input; the SDK adds their size to the unsigned transaction.

***

### networkId?

> `readonly` `optional` **networkId?**: `string`

Defined in: [packages/tx-builder/src/mass.ts:63](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L63)

***

### outputs

> `readonly` **outputs**: readonly `object`[]

Defined in: [packages/tx-builder/src/mass.ts:69](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L69)

***

### payloadBytes?

> `readonly` `optional` **payloadBytes?**: `number`

Defined in: [packages/tx-builder/src/mass.ts:74](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L74)

***

### version?

> `readonly` `optional` **version?**: `0` \| `1`

Defined in: [packages/tx-builder/src/mass.ts:75](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L75)
