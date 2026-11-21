[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EscrowPreparedRelease

# Interface: EscrowPreparedRelease

Defined in: [packages/sdk/src/escrow.ts:356](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L356)

## Properties

### ok

> `readonly` **ok**: `true`

Defined in: [packages/sdk/src/escrow.ts:357](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L357)

***

### preparedRelease

> `readonly` **preparedRelease**: `object`

Defined in: [packages/sdk/src/escrow.ts:358](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L358)

#### args

> **args**: `object`[]

#### branch

> **branch**: `string`

#### draft

> **draft**: `any`

hardkas.silver.spendDraft.v1: the one transaction every signer signs.

#### expectedOutputsHash

> **expectedOutputsHash**: `string`

#### mutualSplit?

> `optional` **mutualSplit?**: `object`

sdk.escrow: the mutualRelease allocation the release was prepared with, when one was given (sompi, decimal).

##### mutualSplit.buyerSompi

> **buyerSompi**: `string`

##### mutualSplit.sellerSompi

> **sellerSompi**: `string`

#### policyHash

> **policyHash**: `string`
