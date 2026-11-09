[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createZkVerificationFactArtifact

# Function: createZkVerificationFactArtifact()

> **createZkVerificationFactArtifact**(`options`): `object`

Defined in: [packages/artifacts/src/zk-fact.ts:45](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/zk-fact.ts#L45)

## Parameters

### options

[`CreateZkVerificationFactOptions`](../interfaces/CreateZkVerificationFactOptions.md)

## Returns

### computeBudget?

> `optional` **computeBudget?**: `number`

### contentHash?

> `optional` **contentHash?**: `string`

### curve?

> `optional` **curve?**: `"BN254"`

### draftArtifactId?

> `optional` **draftArtifactId?**: `string`

### feeSompi?

> `optional` **feeSompi?**: `string`

### guestSystem?

> `optional` **guestSystem?**: `"custom"` \| `"RISC Zero"`

### hardkasVersion?

> `optional` **hardkasVersion?**: `string`

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

### imageId?

> `optional` **imageId?**: `string`

### journalHash?

> `optional` **journalHash?**: `string`

### networkId?

> `optional` **networkId?**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

### offChainVerification?

> `optional` **offChainVerification?**: `"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`

Who verified, if anyone: NOT_PERFORMED is not a failure; the node's precompile is the verifier of record.

### offChainVerifier?

> `optional` **offChainVerifier?**: `string`

### p2shAddress?

> `optional` **p2shAddress?**: `string`

### payoutAddress?

> `optional` **payoutAddress?**: `string`

### payoutSompi?

> `optional` **payoutSompi?**: `string`

### planArtifactId?

> `optional` **planArtifactId?**: `string`

### proofSha256?

> `optional` **proofSha256?**: `string`

SHA-256 of the proof BYTES (the 128-byte compressed proof the signature script pushes).

### provingSystem?

> `optional` **provingSystem?**: `"Groth16"`

### redeemScriptHash?

> `optional` **redeemScriptHash?**: `string`

### schema?

> `optional` **schema?**: `"hardkas.zkVerificationFact.v1"`

### spendUtxo?

> `optional` **spendUtxo?**: `object`

#### spendUtxo.amountSompi?

> `optional` **amountSompi?**: `string`

#### spendUtxo.index?

> `optional` **index?**: `number`

#### spendUtxo.transactionId?

> `optional` **transactionId?**: `string`

### timestamp?

> `optional` **timestamp?**: `string`

Optional: omitted by default so the fact's identity does not depend on the clock (ZK-09).

### txId?

> `optional` **txId?**: `string`

### verifiedOffChain?

> `optional` **verifiedOffChain?**: `boolean`
