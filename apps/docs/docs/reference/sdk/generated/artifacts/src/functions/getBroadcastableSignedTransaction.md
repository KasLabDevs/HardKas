[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / getBroadcastableSignedTransaction

# Function: getBroadcastableSignedTransaction()

> **getBroadcastableSignedTransaction**(`artifact`): `object`

Defined in: [packages/artifacts/src/signed-tx.ts:429](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/signed-tx.ts#L429)

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
