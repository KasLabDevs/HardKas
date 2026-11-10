[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createScenarioResultArtifact

# Function: createScenarioResultArtifact()

> **createScenarioResultArtifact**(`input`): `object`

Defined in: [packages/artifacts/src/scenario-result.ts:49](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L49)

## Parameters

### input

[`ScenarioResultInput`](../interfaces/ScenarioResultInput.md)

## Returns

`object`

### artifactsGenerated?

> `optional` **artifactsGenerated?**: `string`[]

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

### claims?

> `optional` **claims?**: `object`

#### claims.mainnet?

> `optional` **mainnet?**: `false`

#### claims.production?

> `optional` **production?**: `false`

#### claims.testnet?

> `optional` **testnet?**: `false`

### contentHash?

> `optional` **contentHash?**: `string`

### createdAt?

> `optional` **createdAt?**: `string`

### error?

> `optional` **error?**: `object`

#### error.code?

> `optional` **code?**: `string`

#### error.component?

> `optional` **component?**: `string`

#### error.message?

> `optional` **message?**: `string`

#### error.recoverable?

> `optional` **recoverable?**: `boolean`

### evidenceClaim?

> `optional` **evidenceClaim?**: \{ `kind?`: `"none"`; \} \| \{ `kind?`: `"artifacts"`; \} \| \{ `kind?`: `"payment"`; `payments?`: `object`[]; \}

### hardkasVersion?

> `optional` **hardkasVersion?**: `string`

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

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

### networkId?

> `optional` **networkId?**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

### parents?

> `optional` **parents?**: `string`[]

### scenarioName?

> `optional` **scenarioName?**: `string`

### schema?

> `optional` **schema?**: `"hardkas.scenarioResult.v1"`

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

> `optional` **scriptProfile?**: `"standard"` \| `"experimental"`

### status?

> `optional` **status?**: `"failed"` \| `"passed"`

### version?

> `optional` **version?**: `"1.0.0-alpha"`

### workflowId?

> `optional` **workflowId?**: `string`
