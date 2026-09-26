[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createSimulatedSignedTxArtifact

# Function: createSimulatedSignedTxArtifact()

> **createSimulatedSignedTxArtifact**(`plan`, `payload`, `ctx`): `object`

Defined in: [packages/artifacts/src/signed-tx.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/signed-tx.ts#L18)

Creates a canonical simulated signed transaction artifact.

## Parameters

### plan

#### amountSompi?

`string` = `...`

#### assumptionLevel?

`string` = `...`

#### assumptionRef?

`string` = `...`

#### change?

\{ `address?`: `string`; `amountSompi?`: `string`; \} = `...`

#### change.address?

`string` = `...`

#### change.amountSompi?

`string` = `...`

#### computeBudget?

`string` = `...`

#### contentHash?

`string` = `...`

#### createdAt?

`string` = `...`

#### estimatedFeeSompi?

`string` = `...`

#### estimatedMass?

`string` = `...`

#### execution?

\{ `domain?`: `"kaspa-l1"` \| `"evm-l2"`; `mode?`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network?`: `string`; \} = `executionTargetSchema`

#### execution.domain?

`"kaspa-l1"` \| `"evm-l2"` = `...`

#### execution.mode?

`"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"` = `...`

#### execution.network?

`string` = `...`

#### from?

\{ `accountName?`: `string`; `address?`: `string`; `input?`: `string`; \} = `AccountRefSchema`

#### from.accountName?

`string` = `...`

#### from.address?

`string` = `...`

#### from.input?

`string` = `...`

#### hardkasVersion?

`string` = `...`

#### hashVersion?

`string` \| `number` = `...`

#### inputs?

`object`[] = `...`

#### lane?

`string` = `...`

#### lineage?

\{ `artifactId?`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \} = `...`

#### lineage.artifactId?

`string` = `...`

#### lineage.lineageId?

`string` = `...`

#### lineage.parentArtifactId?

`string` = `...`

#### lineage.rootArtifactId?

`string` = `...`

#### lineage.sequence?

`number` = `...`

#### lineageDepth?

`number` = `...`

#### metadata?

`any` = `...`

#### mode?

`"rpc"` \| `"simulator"` \| `"localnet"` = `executionModeSchema`

#### networkId?

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

#### networkProfileRef?

`string` = `...`

#### outputs?

`object`[] = `...`

#### parents?

`string`[] = `...`

#### planId?

`string` = `...`

#### plannerAuthority?

`"KASPA_WASM_GENERATOR"` \| `"SYNTHETIC_SIMULATOR"` = `...`

#### plannerAuthorityDetail?

`string` = `...`

#### policyRef?

`string` = `...`

#### policyRefs?

`string`[] = `...`

#### rpcUrl?

`string` = `...`

#### schema?

`"hardkas.txPlan"` = `...`

#### schemaVersion?

`string` = `...`

#### scriptCapabilities?

(`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[] = `...`

#### scriptMetadata?

\{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental?`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \} = `...`

#### scriptMetadata.consensusImpact?

`"experimental"` \| `"none"` = `...`

#### scriptMetadata.experimental?

`boolean` = `...`

#### scriptMetadata.language?

`"native"` \| `"silverscript"` \| `"tockata"` = `...`

#### scriptMetadata.notes?

`string`[] = `...`

#### scriptMetadata.version?

`string` = `...`

#### scriptProfile?

`"experimental"` \| `"standard"` = `...`

#### storageMass?

`string` = `...`

#### to?

\{ `accountName?`: `string`; `address?`: `string`; `input?`: `string`; \} = `AccountRefSchema`

#### to.accountName?

`string` = `...`

#### to.address?

`string` = `...`

#### to.input?

`string` = `...`

#### txVersion?

`0` \| `1` = `...`

#### version?

`"1.0.0-alpha"` = `...`

#### workflowId?

`string` = `...`

### payload

`string`

### ctx

`RuntimeContext`

## Returns

`object`

### amountSompi?

> `optional` **amountSompi?**: `string`

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

### computeBudget?

> `optional` **computeBudget?**: `string`

### contentHash?

> `optional` **contentHash?**: `string`

### createdAt?

> `optional` **createdAt?**: `string`

### execution?

> `optional` **execution?**: `object` = `executionTargetSchema`

#### execution.domain?

> `optional` **domain?**: `"kaspa-l1"` \| `"evm-l2"`

#### execution.mode?

> `optional` **mode?**: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`

#### execution.network?

> `optional` **network?**: `string`

### from?

> `optional` **from?**: `object` = `AccountRefSchema`

#### from.accountName?

> `optional` **accountName?**: `string`

#### from.address?

> `optional` **address?**: `string`

#### from.input?

> `optional` **input?**: `string`

### hardkasVersion?

> `optional` **hardkasVersion?**: `string`

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

### lane?

> `optional` **lane?**: `string`

### lineage?

> `optional` **lineage?**: `object`

#### lineage.artifactId?

> `optional` **artifactId?**: `string`

#### lineage.lineageId?

> `optional` **lineageId?**: `string`

#### lineage.parentArtifactId?

> `optional` **parentArtifactId?**: `string`

#### lineage.rootArtifactId?

> `optional` **rootArtifactId?**: `string`

#### lineage.sequence?

> `optional` **sequence?**: `number`

### lineageDepth?

> `optional` **lineageDepth?**: `number`

### metadata?

> `optional` **metadata?**: `any`

### mode?

> `optional` **mode?**: `"rpc"` \| `"simulator"` \| `"localnet"` = `executionModeSchema`

### multisig?

> `optional` **multisig?**: `object`

#### multisig.requiredSigners?

> `optional` **requiredSigners?**: `string`[]

#### multisig.signatures?

> `optional` **signatures?**: `object`[]

#### multisig.threshold?

> `optional` **threshold?**: `number`

### networkId?

> `optional` **networkId?**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

### parents?

> `optional` **parents?**: `string`[]

### schema?

> `optional` **schema?**: `"hardkas.signedTx"`

### schemaVersion?

> `optional` **schemaVersion?**: `string`

### scriptCapabilities?

> `optional` **scriptCapabilities?**: (`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]

### scriptMetadata?

> `optional` **scriptMetadata?**: `object`

#### scriptMetadata.consensusImpact?

> `optional` **consensusImpact?**: `"experimental"` \| `"none"`

#### scriptMetadata.experimental?

> `optional` **experimental?**: `boolean`

#### scriptMetadata.language?

> `optional` **language?**: `"native"` \| `"silverscript"` \| `"tockata"`

#### scriptMetadata.notes?

> `optional` **notes?**: `string`[]

#### scriptMetadata.version?

> `optional` **version?**: `string`

### scriptProfile?

> `optional` **scriptProfile?**: `"experimental"` \| `"standard"`

### signatureMetadata?

> `optional` **signatureMetadata?**: `object`[]

### signedId?

> `optional` **signedId?**: `string`

### signedTransaction?

> `optional` **signedTransaction?**: `object`

#### signedTransaction.format?

> `optional` **format?**: `string`

#### signedTransaction.payload?

> `optional` **payload?**: `string`

### sourcePlanId?

> `optional` **sourcePlanId?**: `string`

### status?

> `optional` **status?**: `"signed"` \| `"partially_signed"`

### storageMass?

> `optional` **storageMass?**: `string`

### to?

> `optional` **to?**: `object` = `AccountRefSchema`

#### to.accountName?

> `optional` **accountName?**: `string`

#### to.address?

> `optional` **address?**: `string`

#### to.input?

> `optional` **input?**: `string`

### txId?

> `optional` **txId?**: `string`

### txVersion?

> `optional` **txVersion?**: `0` \| `1`

### unsignedPayloadHash?

> `optional` **unsignedPayloadHash?**: `string`

### version?

> `optional` **version?**: `"1.0.0-alpha"`

### workflowId?

> `optional` **workflowId?**: `string`
