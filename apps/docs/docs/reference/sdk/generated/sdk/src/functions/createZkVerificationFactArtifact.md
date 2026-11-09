[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / createZkVerificationFactArtifact

# Function: createZkVerificationFactArtifact()

> **createZkVerificationFactArtifact**(`options`): `object`

Defined in: [packages/artifacts/dist/index.d.ts:14422](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L14422)

## Parameters

### options

`CreateZkVerificationFactOptions`

## Returns

`object`

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

### hashVersion

> **hashVersion**: `string` \| `number`

### imageId

> **imageId**: `string`

### journalHash

> **journalHash**: `string`

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

### offChainVerification?

> `optional` **offChainVerification?**: `"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`

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

### txId

> **txId**: `string`

### verifiedOffChain

> **verifiedOffChain**: `boolean`
