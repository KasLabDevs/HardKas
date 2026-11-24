[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / lockTimeFinality

# Function: lockTimeFinality()

> **lockTimeFinality**(`input`): [`LockTimeFinality`](../type-aliases/LockTimeFinality.md)

Defined in: [packages/tx-builder/src/lock-time.ts:175](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L175)

rusty-kaspa `check_transaction_finality` at a chain point: final when the lock time is 0, strictly below the reference
(the virtual DAA score for a DAA-score lock, the past median time for a time lock), or when every input's sequence is
the maximum. `unknown` when the reference was not given and the inputs do not make it final.

## Parameters

### input

#### lockTime

`bigint`

#### point

[`LockTimeChainPoint`](../interfaces/LockTimeChainPoint.md)

#### sequences

readonly `bigint`[]

## Returns

[`LockTimeFinality`](../type-aliases/LockTimeFinality.md)
