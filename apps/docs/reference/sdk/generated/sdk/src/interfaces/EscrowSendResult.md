[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EscrowSendResult

# Interface: EscrowSendResult

Defined in: [packages/sdk/src/escrow.ts:686](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L686)

## Properties

### id

> `readonly` **id**: `string`

Defined in: [packages/sdk/src/escrow.ts:687](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L687)

***

### record

> `readonly` **record**: [`EscrowRecord`](EscrowRecord.md)

Defined in: [packages/sdk/src/escrow.ts:693](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L693)

***

### status

> `readonly` **status**: `"confirmed"` \| `"broadcast"`

Defined in: [packages/sdk/src/escrow.ts:690](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L690)

broadcast (the node took it), confirmed (a chain block accepted it, when waited for).

***

### submissionArtifactId?

> `readonly` `optional` **submissionArtifactId?**: `string`

Defined in: [packages/sdk/src/escrow.ts:691](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L691)

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/sdk/src/escrow.ts:688](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L688)

***

### warnings?

> `readonly` `optional` **warnings?**: readonly `string`[]

Defined in: [packages/sdk/src/escrow.ts:692](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L692)
