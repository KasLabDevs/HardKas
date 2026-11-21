[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / lockTimeOfPayload

# Function: lockTimeOfPayload()

> **lockTimeOfPayload**(`rawTransaction`): `object`

Defined in: [packages/tx-builder/src/lock-time.ts:290](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L290)

The lock time and input sequences a signed payload (JSON transaction, as HardKAS sends it) carries.

## Parameters

### rawTransaction

`unknown`

## Returns

`object`

### lockTime

> **lockTime**: `bigint`

### sequences

> **sequences**: `bigint`[]
