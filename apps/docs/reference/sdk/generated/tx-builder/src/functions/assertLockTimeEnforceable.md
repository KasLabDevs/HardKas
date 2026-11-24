[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / assertLockTimeEnforceable

# Function: assertLockTimeEnforceable()

> **assertLockTimeEnforceable**(`lockTime`, `sequences`, `what?`): `void`

Defined in: [packages/tx-builder/src/lock-time.ts:145](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L145)

A signer's check of a lock time against the inputs it signs: an input at the maximum sequence is final, so with it the
lock time is not enforced (every input at the maximum: ignored by consensus) and OpCheckLockTimeVerify fails for it.
HardKAS never builds one; a plan stating one with a lock time is refused (LOCK_TIME_VOID_SEQUENCE).

## Parameters

### lockTime

`bigint`

### sequences

readonly `bigint`[]

### what?

`string` = `"the plan"`

## Returns

`void`
