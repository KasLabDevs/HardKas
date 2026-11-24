[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16TxResult

# Interface: R0Groth16TxResult

Defined in: [packages/sdk/src/zk/toccata.ts:445](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L445)

## Properties

### bindingMode

> **bindingMode**: [`ZkBindingMode`](../type-aliases/ZkBindingMode.md)

Defined in: [packages/sdk/src/zk/toccata.ts:471](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L471)

***

### computeBudget

> **computeBudget**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:466](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L466)

***

### computeMass

> **computeMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:453](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L453)

mass + computeBudget * 100 grams: what the mempool prices.

***

### consensusEnforced

> **consensusEnforced**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:472](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L472)

***

### destinationAddress

> **destinationAddress**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:469](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L469)

***

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk/toccata.ts:473](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L473)

***

### feeEstimate

> **feeEstimate**: [`ToccataZkFeeEstimate`](ToccataZkFeeEstimate.md)

Defined in: [packages/sdk/src/zk/toccata.ts:463](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L463)

***

### feeSompi

> **feeSompi**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:468](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L468)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:475](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L475)

***

### mass

> **mass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:451](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L451)

Non-contextual mass reported by kaspa-wasm for the built transaction (no compute-budget term).

***

### minimumRelayFeeSompi?

> `optional` **minimumRelayFeeSompi?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:460](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L460)

G1 · the node's minimum relay fee for this spend (v1FeeMass / v1MinimumRelayFee: compute or normalized transient mass,
never storage mass): the floor below which ZK_FEE_BELOW_MEMPOOL_MINIMUM / ZK_BOUND_FEE_BELOW_MEMPOOL_MINIMUM is raised.

***

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"`

Defined in: [packages/sdk/src/zk/toccata.ts:470](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L470)

***

### nodeComputeMass?

> `optional` **nodeComputeMass?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:455](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L455)

G1 · the node's compute mass of this spend (rusty-kaspa 2.1.0 rule, v1NonContextualMasses; budget term included).

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:446](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L446)

***

### planArtifact?

> `optional` **planArtifact?**: [`TxPlanArtifact`](TxPlanArtifact.md)

Defined in: [packages/sdk/src/zk/toccata.ts:477](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L477)

Unified V1 transaction plan artifact for this ZK spend

***

### schema

> **schema**: `"hardkas.zk.toccata.tx.v1"`

Defined in: [packages/sdk/src/zk/toccata.ts:447](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L447)

***

### standardMaxMass

> **standardMaxMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:464](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L464)

***

### storageMass?

> `optional` **storageMass?**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:462](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L462)

G1 · the storage mass (KIP-9) of this spend by the node's rule; above BLOCK_STORAGE_MASS_LIMIT no node includes it.

***

### transaction

> **transaction**: `any`

Defined in: [packages/sdk/src/zk/toccata.ts:448](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L448)

***

### transactionId

> **transactionId**: `string`

Defined in: [packages/sdk/src/zk/toccata.ts:449](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L449)

***

### txVersion

> **txVersion**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:467](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L467)

***

### warnings

> **warnings**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk/toccata.ts:474](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L474)

***

### withinStandardMaxMass

> **withinStandardMaxMass**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:465](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L465)

***

### zkFact?

> `optional` **zkFact?**: `object`

Defined in: [packages/sdk/src/zk/toccata.ts:484](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L484)

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

#### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

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
