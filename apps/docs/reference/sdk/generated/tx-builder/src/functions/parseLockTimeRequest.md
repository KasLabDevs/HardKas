[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / parseLockTimeRequest

# Function: parseLockTimeRequest()

> **parseLockTimeRequest**(`value`, `where?`): [`PlanLockTime`](../type-aliases/PlanLockTime.md)

Defined in: [packages/tx-builder/src/lock-time.ts:67](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L67)

The lock time a caller asks for, checked: `undefined` for none (absent, null, or a bare 0, which always meant "no lock"),
else `{ daaScore }` (1 ≤ value \< LOCK_TIME_THRESHOLD) or `{ timestampMs }` (LOCK_TIME_THRESHOLD ≤ value ≤ u64::MAX).
A bare non-zero number, a DAA score at or above the threshold (a time read as a score), a time below it (a score read as
a time), a value of 0 inside a typed one, or any other shape: LOCK_TIME_INVALID.

## Parameters

### value

`unknown`

### where?

`string` = `"lockTime"`

## Returns

[`PlanLockTime`](../type-aliases/PlanLockTime.md)
