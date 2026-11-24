[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EscrowRecord

# Interface: EscrowRecord

Defined in: [packages/sdk/src/escrow.ts:73](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L73)

## Properties

### artifact

> **artifact**: `SilAbiArtifact`

Defined in: [packages/sdk/src/escrow.ts:77](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L77)

***

### config

> **config**: [`EscrowConfig`](EscrowConfig.md)

Defined in: [packages/sdk/src/escrow.ts:75](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L75)

***

### createdAt?

> `optional` **createdAt?**: `string`

Defined in: [packages/sdk/src/escrow.ts:83](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L83)

***

### funding

> **funding**: `object`

Defined in: [packages/sdk/src/escrow.ts:86](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L86)

#### amountSompi?

> `optional` **amountSompi?**: `string`

#### feeSompi?

> `optional` **feeSompi?**: `string`

#### observeFrom?

> `optional` **observeFrom?**: `string`

ESCROW-SAFETY-2: the chain block the node's virtual chain ended at before it was sent (where reconcile looks from).

#### outputIndex?

> `optional` **outputIndex?**: `number`

#### status

> **status**: `"confirmed"` \| `"failed"` \| `"none"` \| `"broadcast"` \| `"verification_timeout"`

"broadcast" = accepted by the node mempool; "confirmed" only after observing it in the chain;
"verification_timeout" = sent, outcome not known yet (ESCROW-SAFETY-2: never funded again before reconcile).

#### transactionId?

> `optional` **transactionId?**: `string`

#### utxoEntry?

> `optional` **utxoEntry?**: `any`

***

### id

> **id**: `string`

Defined in: [packages/sdk/src/escrow.ts:74](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L74)

***

### networkId?

> `optional` **networkId?**: `string`

Defined in: [packages/sdk/src/escrow.ts:82](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L82)

***

### p2shState

> **p2shState**: [`EscrowState`](EscrowState.md)

Defined in: [packages/sdk/src/escrow.ts:78](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L78)

***

### preparedRelease?

> `optional` **preparedRelease?**: `object`

Defined in: [packages/sdk/src/escrow.ts:101](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L101)

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

***

### provenance

> **provenance**: [`EscrowCompileProvenance`](../type-aliases/EscrowCompileProvenance.md)

Defined in: [packages/sdk/src/escrow.ts:79](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L79)

***

### release?

> `optional` **release?**: `object`

Defined in: [packages/sdk/src/escrow.ts:119](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L119)

#### actualOutputsHash

> **actualOutputsHash**: `string`

#### expectedOutputsHash

> **expectedOutputsHash**: `string`

#### feeSompi?

> `optional` **feeSompi?**: `string`

Undefined when it cannot be derived from recorded amounts.

#### fundingOutpoint

> **fundingOutpoint**: `string`

#### observeFrom?

> `optional` **observeFrom?**: `string`

ESCROW-SAFETY-2: the chain block the node's virtual chain ended at before it was sent.

#### status

> **status**: `"confirmed"` \| `"failed"` \| `"broadcast"` \| `"verification_timeout"`

#### transactionId

> **transactionId**: `string`

***

### schema?

> `optional` **schema?**: `string`

Defined in: [packages/sdk/src/escrow.ts:81](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L81)

sdk.escrow records only (the dev server's journal never writes them): the record's schema, network and times.

***

### signatures

> **signatures**: `object`

Defined in: [packages/sdk/src/escrow.ts:113](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L113)

65-byte sig values (hex), by role.

#### arbiter?

> `optional` **arbiter?**: `string`

#### buyer?

> `optional` **buyer?**: `string`

#### seller?

> `optional` **seller?**: `string`

***

### state

> **state**: [`EscrowDomainState`](../type-aliases/EscrowDomainState.md)

Defined in: [packages/sdk/src/escrow.ts:76](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L76)

***

### updatedAt?

> `optional` **updatedAt?**: `string`

Defined in: [packages/sdk/src/escrow.ts:84](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L84)
