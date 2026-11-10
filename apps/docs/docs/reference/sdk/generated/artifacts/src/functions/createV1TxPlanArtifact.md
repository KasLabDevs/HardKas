[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createV1TxPlanArtifact

# Function: createV1TxPlanArtifact()

> **createV1TxPlanArtifact**(`options`): `object`

Defined in: [packages/artifacts/src/tx-plan-v1.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan-v1.ts#L33)

## Parameters

### options

[`CreateV1TxPlanArtifactOptions`](../interfaces/CreateV1TxPlanArtifactOptions.md)

## Returns

`object`

### amountSompi?

> `optional` **amountSompi?**: `string`

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

### assumptionRef?

> `optional` **assumptionRef?**: `string`

### change?

> `optional` **change?**: `object`

#### change.address?

> `optional` **address?**: `string`

#### change.amountSompi?

> `optional` **amountSompi?**: `string`

### computeBudget?

> `optional` **computeBudget?**: `string`

### contentHash?

> `optional` **contentHash?**: `string`

### covenantOutpoints?

> `optional` **covenantOutpoints?**: `string`[]

### createdAt?

> `optional` **createdAt?**: `string`

### estimatedFeeSompi?

> `optional` **estimatedFeeSompi?**: `string`

### estimatedMass?

> `optional` **estimatedMass?**: `string`

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

### genesisCovenantGroups?

> `optional` **genesisCovenantGroups?**: `object`[]

### hardkasVersion?

> `optional` **hardkasVersion?**: `string`

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

### inputs?

> `optional` **inputs?**: `object`[]

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

### maxFeeSompi?

> `optional` **maxFeeSompi?**: `string`

### metadata?

> `optional` **metadata?**: `any`

### mode?

> `optional` **mode?**: `"rpc"` \| `"simulator"` \| `"localnet"` = `executionModeSchema`

### networkId?

> `optional` **networkId?**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

### nextState?

> `optional` **nextState?**: (\{ `covenantId?`: `string`; `input?`: `number`; `outputs?`: `number`[]; `successor?`: \{ `artifactSha256?`: `string`; `constructorArgs?`: `unknown`[]; `state?`: `Record`\<`string`, `unknown`\>; `stateToConstructorArg?`: `Record`\<`string`, `number`\>; \}; \} \| \{ `covenantId?`: `string`; `input?`: `number`; `outputs?`: `number`[]; `states?`: `Record`\<`string`, `unknown`\>[]; \})[]

### outputs?

> `optional` **outputs?**: `object`[]

### parents?

> `optional` **parents?**: `string`[]

### payload?

> `optional` **payload?**: `string`

### planId?

> `optional` **planId?**: `string`

### plannerAuthority?

> `optional` **plannerAuthority?**: `"KASPA_WASM_GENERATOR"` \| `"SYNTHETIC_SIMULATOR"` \| `"HARDKAS_V1_PLANNER"`

### plannerAuthorityDetail?

> `optional` **plannerAuthorityDetail?**: `string`

### policyRef?

> `optional` **policyRef?**: `string`

### policyRefs?

> `optional` **policyRefs?**: `string`[]

### rpcUrl?

> `optional` **rpcUrl?**: `string`

### schema?

> `optional` **schema?**: `"hardkas.txPlan"`

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

### txVersion?

> `optional` **txVersion?**: `0` \| `1`

### version?

> `optional` **version?**: `"1.0.0-alpha"`

### workflowId?

> `optional` **workflowId?**: `string`
