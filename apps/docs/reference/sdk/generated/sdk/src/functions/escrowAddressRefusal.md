[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / escrowAddressRefusal

# Function: escrowAddressRefusal()

> **escrowAddressRefusal**(`records`, `address`): [`EscrowRefusal`](../interfaces/EscrowRefusal.md)

Defined in: [packages/sdk/src/escrow.ts:325](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L325)

Anti-replay / uniqueness guard: an active (not released) escrow already at `address`.

## Parameters

### records

`Iterable`\<[`EscrowRecord`](../interfaces/EscrowRecord.md)\>

### address

`string`

## Returns

[`EscrowRefusal`](../interfaces/EscrowRefusal.md)
