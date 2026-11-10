[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / sompiToKasDisplay

# Function: sompiToKasDisplay()

> **sompiToKasDisplay**(`sompi`): `string`

Defined in: [packages/tx-builder/src/kaspa-uri.ts:43](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/kaspa-uri.ts#L43)

Convert sompi to a KAS display string using pure integer arithmetic.
No floats. No Number(). No precision loss.

Examples:
  100_000_000n → "1"
  150_000_000n → "1.5"
  1_000n       → "0.00001"
  0n           → "0"

## Parameters

### sompi

`bigint`

## Returns

`string`
