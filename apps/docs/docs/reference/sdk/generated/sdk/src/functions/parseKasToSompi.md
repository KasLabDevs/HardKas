[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / parseKasToSompi

# Function: parseKasToSompi()

> **parseKasToSompi**(`input`): `bigint`

Defined in: [packages/core/dist/index.d.ts:2147](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/core/dist/index.d.ts#L2147)

Parses a KAS decimal string (e.g. "1.234") into Sompi (bigint).
If a bigint is provided, it is assumed to be an already-parsed sompi amount.

Rules:
- string input = decimal KAS
- bigint input = already sompi
- format input = sompi
- no floats
- no Number decimal
- no silent rounding

## Parameters

### input

`string` \| `number` \| `bigint`

The KAS amount as a decimal string, or sompi as a bigint.

## Returns

`bigint`

The sompi amount as a bigint.
