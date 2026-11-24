[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / escrowSignCheck

# Function: escrowSignCheck()

> **escrowSignCheck**(`record`, `role`): [`EscrowRefusal`](../interfaces/EscrowRefusal.md) \| \{ `ok`: `true`; `policy`: \{ `requiredSigners`: readonly `string`[]; \}; `publicKeyHex`: `string`; \}

Defined in: [packages/sdk/src/escrow.ts:499](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L499)

Whether `role` may sign the prepared release of `record`: a release is prepared, the branch requires the role, and
the funding UTXO the draft spends is recorded. Returns the branch's policy and the key the escrow names for the role.

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

### role

`string`

## Returns

[`EscrowRefusal`](../interfaces/EscrowRefusal.md) \| \{ `ok`: `true`; `policy`: \{ `requiredSigners`: readonly `string`[]; \}; `publicKeyHex`: `string`; \}
