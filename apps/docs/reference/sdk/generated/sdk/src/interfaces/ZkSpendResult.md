[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkSpendResult

# Interface: ZkSpendResult

Defined in: [packages/sdk/src/zk/spend.ts:47](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L47)

## Properties

### built

> `readonly` **built**: [`R0Groth16TxResult`](R0Groth16TxResult.md)

Defined in: [packages/sdk/src/zk/spend.ts:51](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L51)

The builder's result (fee, masses, warnings, the fact).

***

### networkId

> `readonly` **networkId**: `"simnet"` \| `"testnet-10"`

Defined in: [packages/sdk/src/zk/spend.ts:49](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L49)

***

### plan

> `readonly` **plan**: [`TxPlanArtifact`](TxPlanArtifact.md)

Defined in: [packages/sdk/src/zk/spend.ts:52](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L52)

***

### planPath?

> `readonly` `optional` **planPath?**: `string`

Defined in: [packages/sdk/src/zk/spend.ts:53](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L53)

***

### send

> `readonly` **send**: `object`

Defined in: [packages/sdk/src/zk/spend.ts:59](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L59)

sdk.tx.send's result: the submission record, `submitted`, `alreadySubmitted`, `rejection`.

#### alreadySubmitted?

> `optional` **alreadySubmitted?**: `boolean`

TX-SEND-IDEMPOTENT-1: this workspace had already recorded a submission of the transaction and the node holds it:
nothing was broadcast, `submission` is the recorded one and `derived` the state one observation found.

#### artifactId?

> `optional` **artifactId?**: `string`

#### derived?

> `optional` **derived?**: `DerivedTxStatus`

#### mode?

> `optional` **mode?**: `string`

#### nodeCheck?

> `optional` **nodeCheck?**: `SendNodeCheck`

INT9 · I-2 (TX-SEND-IDEMPOTENT-3): for a payment with no submission recorded here, the read-only node check that
let the broadcast go ahead — NOT_OBSERVED (every read answered, nothing of it found) or UNKNOWN (a read the node
could not answer). A positive state (MEMPOOL, IN_CHAIN, ACCEPTED, CONFIRMED, FINALIZED) refuses the send instead
(ALREADY_SUBMITTED). Returned, never recorded.

#### receipt

> **receipt**: [`TxReceiptArtifact`](TxReceiptArtifact.md) \| `TxSubmissionArtifact`

The artifact this send produced: a simulated `hardkas.txReceipt` in the
simulator, or the immutable `hardkas.txSubmission.v1` for a real broadcast
(R-iii part 1). Read `submission` for the typed real-send record.

#### receiptPath?

> `optional` **receiptPath?**: `string`

#### rejection?

> `optional` **rejection?**: `NodeRejection`

F1.6 · a v1 send (PAYMENT-PREFLIGHT-1: or a payment sent with `preflight`) the node rejected: the class of its
rejection (final: never retried, rebuilt or re-sent).

#### simulated?

> `optional` **simulated?**: `boolean`

#### submission?

> `optional` **submission?**: `TxSubmissionArtifact`

#### submitted?

> `optional` **submitted?**: `boolean`

#### txId?

> `optional` **txId?**: `string`

***

### signed

> `readonly` **signed**: `Record`\<`string`, `any`\>

Defined in: [packages/sdk/src/zk/spend.ts:54](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L54)

***

### signedPath?

> `readonly` `optional` **signedPath?**: `string`

Defined in: [packages/sdk/src/zk/spend.ts:55](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L55)

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/sdk/src/zk/spend.ts:48](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L48)

***

### zkFact?

> `readonly` `optional` **zkFact?**: `object`

Defined in: [packages/sdk/src/zk/spend.ts:56](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L56)

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

***

### zkFactPath?

> `readonly` `optional` **zkFactPath?**: `string`

Defined in: [packages/sdk/src/zk/spend.ts:57](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/spend.ts#L57)
