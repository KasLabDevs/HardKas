[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / parseKaspaScript

# Function: parseKaspaScript()

> **parseKaspaScript**(`scriptHex`): `object`

Defined in: [packages/sdk/src/zk/toccata.ts:624](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L624)

Tokenises a Kaspa txscript into opcodes and data pushes. Pure, no WASM. Returns an error instead
of a partial token list when a push runs past the end of the script.

## Parameters

### scriptHex

`string`

## Returns

`object`

### error?

> `optional` **error?**: `string`

### ops

> **ops**: [`KaspaScriptOp`](../interfaces/KaspaScriptOp.md)[]
