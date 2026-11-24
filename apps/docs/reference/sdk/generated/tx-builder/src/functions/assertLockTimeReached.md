[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / assertLockTimeReached

# Function: assertLockTimeReached()

> **assertLockTimeReached**(`input`): [`LockTimeFinality`](../type-aliases/LockTimeFinality.md)

Defined in: [packages/tx-builder/src/lock-time.ts:195](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L195)

The send preflight of a lock time, read-only, before a broadcast: LOCK_TIME_NOT_REACHED when the node's virtual DAA score
(or past median time) has not passed it, LOCK_TIME_UNVERIFIABLE when the node did not say. Sent now, the node would refuse
the transaction (it is not final) and that refusal would be the transaction's one recorded submission; the identical
transaction, valid once the lock is reached, has the same txId and could never be sent again. Refused here, nothing is
sent or recorded, and it can be sent once the lock is reached.

## Parameters

### input

#### lockTime

`bigint`

#### point

[`LockTimeChainPoint`](../interfaces/LockTimeChainPoint.md)

#### sequences

readonly `bigint`[]

#### what?

`string`

## Returns

[`LockTimeFinality`](../type-aliases/LockTimeFinality.md)
