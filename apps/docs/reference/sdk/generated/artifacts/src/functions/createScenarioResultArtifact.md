[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createScenarioResultArtifact

# Function: createScenarioResultArtifact()

> **createScenarioResultArtifact**(`input`): `object`

Defined in: [packages/artifacts/src/scenario-result.ts:49](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/scenario-result.ts#L49)

## Parameters

### input

[`ScenarioResultInput`](../interfaces/ScenarioResultInput.md)

## Returns

`object`

### artifactsGenerated

> **artifactsGenerated**: `string`[]

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

### claims

> **claims**: `object`

#### claims.mainnet

> **mainnet**: `false`

#### claims.production

> **production**: `false`

#### claims.testnet

> **testnet**: `false`

### contentHash?

> `optional` **contentHash?**: `string`

### createdAt

> **createdAt**: `string`

### error?

> `optional` **error?**: `object`

#### error.code

> **code**: `string`

#### error.component?

> `optional` **component?**: `string`

#### error.message

> **message**: `string`

#### error.recoverable?

> `optional` **recoverable?**: `boolean`

### evidenceClaim?

> `optional` **evidenceClaim?**: \{ `kind`: `"none"`; \} \| \{ `kind`: `"artifacts"`; \} \| \{ `kind`: `"payment"`; `payments`: `object`[]; \}

### hardkasVersion

> **hardkasVersion**: `string`

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

### lineage?

> `optional` **lineage?**: `object`

#### lineage.artifactId

> **artifactId**: `string`

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

### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"` = `executionModeSchema`

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

### parents?

> `optional` **parents?**: `string`[]

### scenarioName

> **scenarioName**: `string`

### schema

> **schema**: `"hardkas.scenarioResult.v1"`

### schemaVersion?

> `optional` **schemaVersion?**: `string`

### scriptCapabilities?

> `optional` **scriptCapabilities?**: (`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]

### scriptMetadata?

> `optional` **scriptMetadata?**: `object`

#### scriptMetadata.consensusImpact?

> `optional` **consensusImpact?**: `"experimental"` \| `"none"`

#### scriptMetadata.experimental

> **experimental**: `boolean`

#### scriptMetadata.language?

> `optional` **language?**: `"native"` \| `"silverscript"` \| `"tockata"`

#### scriptMetadata.notes?

> `optional` **notes?**: `string`[]

#### scriptMetadata.version?

> `optional` **version?**: `string`

### scriptProfile?

> `optional` **scriptProfile?**: `"standard"` \| `"experimental"`

### status

> **status**: `"failed"` \| `"passed"`

### version

> **version**: `"1.0.0-alpha"`

### workflowId?

> `optional` **workflowId?**: `string`
