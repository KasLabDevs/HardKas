[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EscrowReleaseReady

# Interface: EscrowReleaseReady

Defined in: [packages/sdk/src/escrow.ts:562](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L562)

## Properties

### actualOutputsHash

> `readonly` **actualOutputsHash**: `string`

Defined in: [packages/sdk/src/escrow.ts:567](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L567)

***

### finalized

> `readonly` **finalized**: `object`

Defined in: [packages/sdk/src/escrow.ts:566](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L566)

#### rpcTransaction

> **rpcTransaction**: `any`

#### signatureScriptHex

> **signatureScriptHex**: `string`

#### txId

> **txId**: `string`

***

### ok

> `readonly` **ok**: `true`

Defined in: [packages/sdk/src/escrow.ts:563](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L563)

***

### policy

> `readonly` **policy**: `object`

Defined in: [packages/sdk/src/escrow.ts:565](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L565)

#### requiredSigners

> **requiredSigners**: `string`[]

***

### prepared

> `readonly` **prepared**: `object`

Defined in: [packages/sdk/src/escrow.ts:564](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L564)

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
