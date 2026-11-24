[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Kcc20PlannedTransfer

# Interface: Kcc20PlannedTransfer

Defined in: [packages/sdk/src/kcc20.ts:161](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L161)

## Properties

### covenantId

> `readonly` **covenantId**: `string`

Defined in: [packages/sdk/src/kcc20.ts:165](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L165)

***

### feeSource

> `readonly` **feeSource**: [`Kcc20FeeSource`](../type-aliases/Kcc20FeeSource.md)

Defined in: [packages/sdk/src/kcc20.ts:172](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L172)

Who paid the fee (kcc20TransferFeeSource): the funder, the sender's token change, the sender's own coins, or the explicit outputs' remainder.

***

### inputs

> `readonly` **inputs**: readonly `object`[]

Defined in: [packages/sdk/src/kcc20.ts:168](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L168)

***

### outputs

> `readonly` **outputs**: readonly `object`[]

Defined in: [packages/sdk/src/kcc20.ts:169](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L169)

***

### plan

> `readonly` **plan**: `any`

Defined in: [packages/sdk/src/kcc20.ts:163](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L163)

The v1 plan (stored), owner signatures in its witnesses; sign it with `sign` (the fee inputs), send it with `send`.

***

### program

> `readonly` **program**: [`Kcc20Program`](Kcc20Program.md)

Defined in: [packages/sdk/src/kcc20.ts:170](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L170)

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/sdk/src/kcc20.ts:164](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L164)

***

### verdict

> `readonly` **verdict**: `Kcc20Verdict`

Defined in: [packages/sdk/src/kcc20.ts:167](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L167)

The KCC-20 rules' verdict on this transfer, with the signatures made here.
