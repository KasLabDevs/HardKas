[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / deterministicCompare

# Function: deterministicCompare()

> **deterministicCompare**(`a`, `b`): `number`

Defined in: [packages/core/src/deterministic.ts:5](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/deterministic.ts#L5)

Deterministic comparison utility for cross-platform string sorting.
Avoids localeCompare() which is dependent on the host machine's ICU version and OS locale.

## Parameters

### a

`string`

### b

`string`

## Returns

`number`
