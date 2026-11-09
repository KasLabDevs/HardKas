[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / parseKaspaScript

# Function: parseKaspaScript()

> **parseKaspaScript**(`scriptHex`): `object`

Defined in: [packages/sdk/src/zk/toccata.ts:547](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L547)

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
