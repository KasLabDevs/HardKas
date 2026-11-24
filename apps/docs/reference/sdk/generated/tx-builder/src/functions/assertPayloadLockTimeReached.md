[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / assertPayloadLockTimeReached

# Function: assertPayloadLockTimeReached()

> **assertPayloadLockTimeReached**(`rawTransaction`, `dagInfo`, `what?`): [`LockTimeFinality`](../type-aliases/LockTimeFinality.md)

Defined in: [packages/tx-builder/src/lock-time.ts:283](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L283)

The lock-time preflight of a signed payload against a node's getBlockDagInfo answer (read by the caller right before
its broadcast): returns the verdict when the transaction is final there, throws LOCK_TIME_NOT_REACHED /
LOCK_TIME_UNVERIFIABLE otherwise (assertLockTimeReached). A payload whose lock time cannot be read is LOCK_TIME_INVALID.

## Parameters

### rawTransaction

`unknown`

### dagInfo

`unknown`

### what?

`string`

## Returns

[`LockTimeFinality`](../type-aliases/LockTimeFinality.md)
