[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / formatSignedSompiToKas

# Function: formatSignedSompiToKas()

> **formatSignedSompiToKas**(`sompi`): `string`

Defined in: [packages/core/src/money.ts:121](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/money.ts#L121)

Formats a signed sompi amount into a KAS decimal string.
This is meant ONLY for reporting deltas, audit statements, or rendering logic.
It is NOT intended for validating spendable balances or user input amounts.

## Parameters

### sompi

`string` \| `bigint`

The sompi amount as a signed bigint or string representation of a bigint.

## Returns

`string`

The KAS amount as a string (with a leading '-' if negative).
