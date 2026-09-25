[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / sompiToKasDisplay

# Function: sompiToKasDisplay()

> **sompiToKasDisplay**(`sompi`): `string`

Defined in: [packages/tx-builder/src/kaspa-uri.ts:43](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-uri.ts#L43)

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
