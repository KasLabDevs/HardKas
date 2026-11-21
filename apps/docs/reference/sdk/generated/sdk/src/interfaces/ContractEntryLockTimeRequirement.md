[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ContractEntryLockTimeRequirement

# Interface: ContractEntryLockTimeRequirement

Defined in: [packages/sdk/src/contract-lock-time.ts:25](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/contract-lock-time.ts#L25)

What one top-level `require(tx.daa >= x)` / `require(tx.time >= x)` statement of an entry asks of the lock time.

## Properties

### atLeast?

> `readonly` `optional` **atLeast?**: `bigint`

Defined in: [packages/sdk/src/contract-lock-time.ts:29](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/contract-lock-time.ts#L29)

x, when HardKAS can read it (an integer literal, or a parameter whose int value it was given).

***

### kind

> `readonly` **kind**: `LockTimeKind`

Defined in: [packages/sdk/src/contract-lock-time.ts:27](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/contract-lock-time.ts#L27)

"daaScore" for `tx.daa`, "timestampMs" for `tx.time`.

***

### statement

> `readonly` **statement**: `string`

Defined in: [packages/sdk/src/contract-lock-time.ts:31](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/contract-lock-time.ts#L31)

The statement as the source writes it.
