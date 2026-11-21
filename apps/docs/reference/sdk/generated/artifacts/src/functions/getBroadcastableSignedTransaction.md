[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / getBroadcastableSignedTransaction

# Function: getBroadcastableSignedTransaction()

> **getBroadcastableSignedTransaction**(`artifact`): `object`

Defined in: [packages/artifacts/src/signed-tx.ts:429](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/signed-tx.ts#L429)

Validates and extracts the raw transaction from a signed artifact.

IC-6′.4: a synthetic authorization is never a signature, so it is never
broadcastable: it can only be executed by the simulator.

## Parameters

### artifact

`any`

## Returns

`object`

### mode

> **mode**: `string`

### rawTransaction

> **rawTransaction**: `string`
