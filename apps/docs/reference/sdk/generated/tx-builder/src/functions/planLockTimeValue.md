[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / planLockTimeValue

# Function: planLockTimeValue()

> **planLockTimeValue**(`plan`): `bigint`

Defined in: [packages/tx-builder/src/lock-time.ts:118](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/lock-time.ts#L118)

The lock time a plan authorizes, as the u64 its transaction carries: 0 when the plan states none (absent, null, or a
bare 0, as every plan before CLTV); the value of its typed `lockTime` (\{ daaScore \} | \{ timestampMs \}, decimal strings,
with an optional `observedAt`) checked against the threshold. Anything else — a bare non-zero number, a wrong kind, an
unknown field — is LOCK_TIME_INVALID: a signer or a send never guesses which lock a plan meant.

## Parameters

### plan

`unknown`

## Returns

`bigint`
