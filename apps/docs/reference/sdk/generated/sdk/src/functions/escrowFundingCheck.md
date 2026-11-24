[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / escrowFundingCheck

# Function: escrowFundingCheck()

> **escrowFundingCheck**(`record`, `networkId?`): `object`

Defined in: [packages/sdk/src/escrow.ts:313](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L313)

G3 for a record about to be funded: the funding amount, and the refusal or the warnings of escrowReleaseFeeCheck.

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

### networkId?

`string` = `"simnet"`

## Returns

`object`

### refusal?

> `optional` **refusal?**: [`EscrowRefusal`](../interfaces/EscrowRefusal.md)

### totalAmount

> **totalAmount**: `bigint`

### warnings

> **warnings**: `string`[]
