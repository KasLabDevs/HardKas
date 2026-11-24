[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / applyEscrowPreparedRelease

# Function: applyEscrowPreparedRelease()

> **applyEscrowPreparedRelease**(`record`, `prepared`): `void`

Defined in: [packages/sdk/src/escrow.ts:489](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L489)

A prepared release becomes the record's: PARTIALLY_SIGNED, every earlier signature dropped (they signed another draft).

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

### prepared

#### args

`object`[]

#### branch

`string`

#### draft

`any`

hardkas.silver.spendDraft.v1: the one transaction every signer signs.

#### expectedOutputsHash

`string`

#### mutualSplit?

\{ `buyerSompi`: `string`; `sellerSompi`: `string`; \}

sdk.escrow: the mutualRelease allocation the release was prepared with, when one was given (sompi, decimal).

#### mutualSplit.buyerSompi

`string`

#### mutualSplit.sellerSompi

`string`

#### policyHash

`string`

## Returns

`void`
