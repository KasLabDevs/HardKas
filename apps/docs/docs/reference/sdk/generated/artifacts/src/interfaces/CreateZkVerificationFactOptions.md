[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / CreateZkVerificationFactOptions

# Interface: CreateZkVerificationFactOptions

Defined in: [packages/artifacts/src/zk-fact.ts:7](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L7)

## Properties

### computeBudget

> `readonly` **computeBudget**: `number`

Defined in: [packages/artifacts/src/zk-fact.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L36)

***

### curve?

> `readonly` `optional` **curve?**: `"BN254"`

Defined in: [packages/artifacts/src/zk-fact.ts:10](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L10)

***

### draftArtifactId?

> `readonly` `optional` **draftArtifactId?**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L32)

***

### feeSompi

> `readonly` **feeSompi**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:37](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L37)

***

### guestSystem?

> `readonly` `optional` **guestSystem?**: `"custom"` \| `"RISC Zero"`

Defined in: [packages/artifacts/src/zk-fact.ts:11](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L11)

***

### imageId

> `readonly` **imageId**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:12](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L12)

***

### journalHash

> `readonly` **journalHash**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:13](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L13)

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:8](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L8)

***

### offChainVerification?

> `readonly` `optional` **offChainVerification?**: `"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`

Defined in: [packages/artifacts/src/zk-fact.ts:21](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L21)

VERIFIED / NOT_PERFORMED / FAILED; defaults from verifiedOffChain (true -\> VERIFIED, false -\> NOT_PERFORMED).

***

### offChainVerifier?

> `readonly` `optional` **offChainVerifier?**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:23](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L23)

Id of the verifier that produced a VERIFIED / FAILED status.

***

### p2shAddress

> `readonly` **p2shAddress**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L29)

***

### payoutAddress

> `readonly` **payoutAddress**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:34](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L34)

***

### payoutSompi

> `readonly` **payoutSompi**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L35)

***

### planArtifactId?

> `readonly` `optional` **planArtifactId?**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:31](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L31)

***

### proofSha256

> `readonly` **proofSha256**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:14](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L14)

***

### provingSystem?

> `readonly` `optional` **provingSystem?**: `"Groth16"`

Defined in: [packages/artifacts/src/zk-fact.ts:9](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L9)

***

### redeemScriptHash

> `readonly` **redeemScriptHash**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:30](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L30)

***

### spendUtxo

> `readonly` **spendUtxo**: `object`

Defined in: [packages/artifacts/src/zk-fact.ts:24](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L24)

#### amountSompi

> `readonly` **amountSompi**: `string`

#### index

> `readonly` **index**: `number`

#### transactionId

> `readonly` **transactionId**: `string`

***

### timestamp?

> `readonly` `optional` **timestamp?**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L42)

Optional wall-clock time. Omitted by default so that the fact's identity (contentHash) depends only on
what it records, never on when it was built (ZK-09); when given, it is part of the identity.

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/artifacts/src/zk-fact.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L33)

***

### verifiedOffChain

> `readonly` **verifiedOffChain**: `boolean`

Defined in: [packages/artifacts/src/zk-fact.ts:19](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L19)

The producer's statement that the proof was verified off-chain. HardKAS's own builder sets it only from
its verifier (verifyR0Groth16ReceiptLocal); a hand-built fact carries whatever its author asserts.
