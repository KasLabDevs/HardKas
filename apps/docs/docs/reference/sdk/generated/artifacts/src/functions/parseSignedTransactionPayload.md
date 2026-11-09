[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / parseSignedTransactionPayload

# Function: parseSignedTransactionPayload()

> **parseSignedTransactionPayload**(`payload`): \{ `inputs`: `string`[]; `ok`: `true`; `outputs`: `object`[]; \} \| \{ `ok`: `false`; `reason`: `string`; \}

Defined in: [packages/artifacts/src/submission-fee.ts:111](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/submission-fee.ts#L111)

Parses a signed payload into `{ inputs: outpoint keys, outputs: amounts (+script/address) }`, or explains why it cannot.

## Parameters

### payload

`unknown`

## Returns

\{ `inputs`: `string`[]; `ok`: `true`; `outputs`: `object`[]; \} \| \{ `ok`: `false`; `reason`: `string`; \}
