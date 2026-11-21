[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / CreateZkVerificationFactOptions

# Interface: CreateZkVerificationFactOptions

Defined in: [packages/artifacts/src/zk-fact.ts:7](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L7)

## Properties

### computeBudget

> `readonly` **computeBudget**: `number`

Defined in: [packages/artifacts/src/zk-fact.ts:42](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L42)

***

### curve?

> `readonly` `optional` **curve?**: `"BN254"`

Defined in: [packages/artifacts/src/zk-fact.ts:10](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L10)

***

### draftArtifactId?

> `readonly` `optional` **draftArtifactId?**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:38](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L38)

***

### feeSompi

> `readonly` **feeSompi**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:43](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L43)

***

### guestSystem?

> `readonly` `optional` **guestSystem?**: `"custom"` \| `"RISC Zero"`

Defined in: [packages/artifacts/src/zk-fact.ts:11](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L11)

***

### imageId

> `readonly` **imageId**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:12](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L12)

***

### journalHash

> `readonly` **journalHash**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:13](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L13)

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:8](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L8)

***

### offChainVerification?

> `readonly` `optional` **offChainVerification?**: `"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`

Defined in: [packages/artifacts/src/zk-fact.ts:27](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L27)

VERIFIED / NOT_PERFORMED / FAILED; defaults from verifiedOffChain (true -\> VERIFIED, false -\> NOT_PERFORMED).

***

### offChainVerifier?

> `readonly` `optional` **offChainVerifier?**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:29](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L29)

Id of the verifier that produced a VERIFIED / FAILED status.

***

### p2shAddress

> `readonly` **p2shAddress**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:35](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L35)

***

### payoutAddress

> `readonly` **payoutAddress**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:40](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L40)

***

### payoutSompi

> `readonly` **payoutSompi**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:41](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L41)

***

### planArtifactId?

> `readonly` `optional` **planArtifactId?**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:37](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L37)

***

### proofSha256

> `readonly` **proofSha256**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:20](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L20)

SHA-256 of the proof bytes this fact was built from. NOT an identity of the proof or of the spend (H6): Groth16 proofs
are malleable — (A, B, C) → (r⁻¹·A, r·B, C) is another valid proof of the same statement — so anyone who sees a proof
(in the mempool, for example) can produce others with different bytes and hashes. Identify a spend by its txId and
spent outpoint, and a statement by (imageId, journalHash); never deduplicate or index by this value.

***

### provingSystem?

> `readonly` `optional` **provingSystem?**: `"Groth16"`

Defined in: [packages/artifacts/src/zk-fact.ts:9](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L9)

***

### redeemScriptHash

> `readonly` **redeemScriptHash**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:36](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L36)

***

### spendUtxo

> `readonly` **spendUtxo**: `object`

Defined in: [packages/artifacts/src/zk-fact.ts:30](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L30)

#### amountSompi

> `readonly` **amountSompi**: `string`

#### index

> `readonly` **index**: `number`

#### transactionId

> `readonly` **transactionId**: `string`

***

### timestamp?

> `readonly` `optional` **timestamp?**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:48](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L48)

Optional wall-clock time. Omitted by default so that the fact's identity (contentHash) depends only on
what it records, never on when it was built (ZK-09); when given, it is part of the identity.

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:39](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L39)

***

### verifiedOffChain

> `readonly` **verifiedOffChain**: `boolean`

Defined in: [packages/artifacts/src/zk-fact.ts:25](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L25)

The producer's statement that the proof was verified off-chain. HardKAS's own builder sets it only from
its verifier (verifyR0Groth16ReceiptLocal); a hand-built fact carries whatever its author asserts.
