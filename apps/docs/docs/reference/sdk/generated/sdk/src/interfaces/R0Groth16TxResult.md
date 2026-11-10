[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16TxResult

# Interface: R0Groth16TxResult

Defined in: [packages/sdk/src/zk/toccata.ts:409](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L409)

## Properties

### bindingMode

> **bindingMode**: [`ZkBindingMode`](../type-aliases/ZkBindingMode.md)

Defined in: [packages/sdk/src/zk/toccata.ts:426](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L426)

***

### computeBudget

> **computeBudget**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:421](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L421)

***

### computeMass

> **computeMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:417](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L417)

mass + computeBudget * 100 grams: what the mempool prices.

***

### consensusEnforced

> **consensusEnforced**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:427](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L427)

***

### destinationAddress

> **destinationAddress**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:424](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L424)

***

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk/toccata.ts:428](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L428)

***

### feeEstimate

> **feeEstimate**: [`ToccataZkFeeEstimate`](ToccataZkFeeEstimate.md)

Defined in: [packages/sdk/src/zk/toccata.ts:418](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L418)

***

### feeSompi

> **feeSompi**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:423](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L423)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:430](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L430)

***

### mass

> **mass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:415](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L415)

Non-contextual mass reported by kaspa-wasm for the built transaction (no compute-budget term).

***

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"`

Defined in: [packages/sdk/src/zk/toccata.ts:425](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L425)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:410](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L410)

***

### planArtifact?

> `optional` **planArtifact?**: [`TxPlanArtifact`](TxPlanArtifact.md)

Defined in: [packages/sdk/src/zk/toccata.ts:432](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L432)

Unified V1 transaction plan artifact for this ZK spend

***

### schema

> **schema**: `"hardkas.zk.toccata.tx.v1"`

Defined in: [packages/sdk/src/zk/toccata.ts:411](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L411)

***

### standardMaxMass

> **standardMaxMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:419](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L419)

***

### transaction

> **transaction**: `any`

Defined in: [packages/sdk/src/zk/toccata.ts:412](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L412)

***

### transactionId

> **transactionId**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:413](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L413)

***

### txVersion

> **txVersion**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:422](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L422)

***

### warnings

> **warnings**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:429](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L429)

***

### withinStandardMaxMass

> **withinStandardMaxMass**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:420](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L420)

***

### zkFact?

> `optional` **zkFact?**: `object`

Defined in: [packages/sdk/src/zk/toccata.ts:439](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L439)

Record of this ZK spend (image id, journal hash, SHA-256 of the proof bytes, scripts, outpoint, payout,
off-chain verification status). It is an unkeyed RECORD, not a binding: a proof-only lock binds only the
image id and nothing ties the proof to these outputs (HK-16); a proof-and-output-bound lock binds the outputs
in its redeem script, not through this record.

#### computeBudget

> **computeBudget**: `number`

#### contentHash?

> `optional` **contentHash?**: `string`

#### curve

> **curve**: `"BN254"`

#### draftArtifactId?

> `optional` **draftArtifactId?**: `string`

#### feeSompi

> **feeSompi**: `string`

#### guestSystem

> **guestSystem**: `"custom"` \| `"RISC Zero"`

#### hardkasVersion

> **hardkasVersion**: `string`

#### hashVersion

> **hashVersion**: `string` \| `number`

#### imageId

> **imageId**: `string`

#### journalHash

> **journalHash**: `string`

#### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

#### offChainVerification?

> `optional` **offChainVerification?**: `"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`

#### offChainVerifier?

> `optional` **offChainVerifier?**: `string`

#### p2shAddress

> **p2shAddress**: `string`

#### payoutAddress

> **payoutAddress**: `string`

#### payoutSompi

> **payoutSompi**: `string`

#### planArtifactId?

> `optional` **planArtifactId?**: `string`

#### proofSha256

> **proofSha256**: `string`

#### provingSystem

> **provingSystem**: `"Groth16"`

#### redeemScriptHash

> **redeemScriptHash**: `string`

#### schema

> **schema**: `"hardkas.zkVerificationFact.v1"`

#### spendUtxo

> **spendUtxo**: `object`

##### spendUtxo.amountSompi

> **amountSompi**: `string`

##### spendUtxo.index

> **index**: `number`

##### spendUtxo.transactionId

> **transactionId**: `string`

#### timestamp?

> `optional` **timestamp?**: `string`

#### txId

> **txId**: `string`

#### verifiedOffChain

> **verifiedOffChain**: `boolean`
