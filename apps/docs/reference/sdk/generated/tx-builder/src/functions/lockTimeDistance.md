[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / lockTimeDistance

# Function: lockTimeDistance()

> **lockTimeDistance**(`lockTime`, `point`): `bigint`

Defined in: [packages/tx-builder/src/lock-time.ts:230](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L230)

How far a lock time is from a chain point, in its own unit (0 when reached; undefined when the point is unknown).

## Parameters

### lockTime

`bigint`

### point

[`LockTimeChainPoint`](../interfaces/LockTimeChainPoint.md)

## Returns

`bigint`
