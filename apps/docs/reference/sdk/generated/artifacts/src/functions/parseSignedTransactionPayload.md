[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / parseSignedTransactionPayload

# Function: parseSignedTransactionPayload()

> **parseSignedTransactionPayload**(`payload`): \{ `inputs`: `string`[]; `lockTime?`: `bigint` \| `"invalid"`; `ok`: `true`; `outputs`: `object`[]; \} \| \{ `ok`: `false`; `reason`: `string`; \}

Defined in: [packages/artifacts/src/submission-fee.ts:113](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/submission-fee.ts#L113)

Parses a signed payload into `{ inputs: outpoint keys, outputs: amounts (+script/address) }`, or explains why it cannot.

## Parameters

### payload

`unknown`

## Returns

\{ `inputs`: `string`[]; `lockTime?`: `bigint` \| `"invalid"`; `ok`: `true`; `outputs`: `object`[]; \} \| \{ `ok`: `false`; `reason`: `string`; \}
