[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / escrowPolicyOf

# Function: escrowPolicyOf()

> **escrowPolicyOf**(`record`, `branch`): `object`

Defined in: [packages/sdk/src/escrow.ts:350](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L350)

The signers a branch requires (a legacy record's own policy, else the contract's branch table).

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

### branch

`string`

## Returns

`object`

### amountKey?

> `optional` **amountKey?**: `string`

### recipient?

> `optional` **recipient?**: `string`

### requiredSigners

> **requiredSigners**: `string`[]
