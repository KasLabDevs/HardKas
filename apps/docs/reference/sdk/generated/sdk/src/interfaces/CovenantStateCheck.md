[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantStateCheck

# Interface: CovenantStateCheck

Defined in: [packages/sdk/src/covenants.ts:180](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L180)

The declared state of an output, checked against its address (the P2SH commits to the script that holds it).

## Properties

### detail?

> `readonly` `optional` **detail?**: `string`

Defined in: [packages/sdk/src/covenants.ts:184](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L184)

***

### state?

> `readonly` `optional` **state?**: `Readonly`\<`Record`\<`string`, `V1ArgValue`\>\>

Defined in: [packages/sdk/src/covenants.ts:183](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L183)

The state the checked script holds (decoded canonically), field → value.

***

### status

> `readonly` **status**: `"mismatch"` \| `"address-commits"` \| `"unverified"`

Defined in: [packages/sdk/src/covenants.ts:181](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L181)
