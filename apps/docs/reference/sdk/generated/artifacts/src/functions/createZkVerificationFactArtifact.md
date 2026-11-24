[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createZkVerificationFactArtifact

# Function: createZkVerificationFactArtifact()

> **createZkVerificationFactArtifact**(`options`): `object`

Defined in: [packages/artifacts/src/zk-fact.ts:51](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/zk-fact.ts#L51)

## Parameters

### options

[`CreateZkVerificationFactOptions`](../interfaces/CreateZkVerificationFactOptions.md)

## Returns

### computeBudget

> **computeBudget**: `number`

### contentHash?

> `optional` **contentHash?**: `string`

### curve

> **curve**: `"BN254"`

### draftArtifactId?

> `optional` **draftArtifactId?**: `string`

### feeSompi

> **feeSompi**: `string`

### guestSystem

> **guestSystem**: `"custom"` \| `"RISC Zero"`

### hardkasVersion

> **hardkasVersion**: `string`

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

### imageId

> **imageId**: `string`

### journalHash

> **journalHash**: `string`

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

### offChainVerification?

> `optional` **offChainVerification?**: `"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`

Who verified, if anyone: NOT_PERFORMED is not a failure; the node's precompile is the verifier of record.

### offChainVerifier?

> `optional` **offChainVerifier?**: `string`

### p2shAddress

> **p2shAddress**: `string`

### payoutAddress

> **payoutAddress**: `string`

### payoutSompi

> **payoutSompi**: `string`

### planArtifactId?

> `optional` **planArtifactId?**: `string`

### proofSha256

> **proofSha256**: `string`

SHA-256 of the proof BYTES (the 128-byte compressed proof the signature script pushes).

### provingSystem

> **provingSystem**: `"Groth16"`

### redeemScriptHash

> **redeemScriptHash**: `string`

### schema

> **schema**: `"hardkas.zkVerificationFact.v1"`

### spendUtxo

> **spendUtxo**: `object`

#### spendUtxo.amountSompi

> **amountSompi**: `string`

#### spendUtxo.index

> **index**: `number`

#### spendUtxo.transactionId

> **transactionId**: `string`

### timestamp?

> `optional` **timestamp?**: `string`

Optional: omitted by default so the fact's identity does not depend on the clock (ZK-09).

### txId

> **txId**: `string`

### verifiedOffChain

> **verifiedOffChain**: `boolean`
