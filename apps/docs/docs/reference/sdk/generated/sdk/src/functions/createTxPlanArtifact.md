[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / createTxPlanArtifact

# Function: createTxPlanArtifact()

> **createTxPlanArtifact**(`options`): `object`

Defined in: [packages/artifacts/dist/index.d.ts:13523](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L13523)

Creates a canonical TxPlan artifact from a TxBuilder plan.

The plan is a lineage ROOT: its lineage carries only its own artifactId
(excluded from the hash by exact path) and a sequence. It stores no
`lineageId`/`rootArtifactId` copies of itself; children reference the root's
real artifactId instead (Closure Pack D-Q1.d, the two-pass hashing of H6 is gone).

## Parameters

### options

`CreateTxPlanArtifactOptions`

## Returns

`object`

### amountSompi

> **amountSompi**: `string`

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

### assumptionRef?

> `optional` **assumptionRef?**: `string`

### change?

> `optional` **change?**: `object`

#### change.address

> **address**: `string`

#### change.amountSompi

> **amountSompi**: `string`

### computeBudget?

> `optional` **computeBudget?**: `string`

### contentHash?

> `optional` **contentHash?**: `string`

### covenantOutpoints?

> `optional` **covenantOutpoints?**: `string`[]

### createdAt

> **createdAt**: `string`

### estimatedFeeSompi

> **estimatedFeeSompi**: `string`

### estimatedMass

> **estimatedMass**: `string`

### execution

> **execution**: `object`

#### execution.domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### execution.mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`

#### execution.network

> **network**: `string`

### from

> **from**: `object`

#### from.accountName?

> `optional` **accountName?**: `string`

#### from.address

> **address**: `string`

#### from.input?

> `optional` **input?**: `string`

### genesisCovenantGroups?

> `optional` **genesisCovenantGroups?**: `object`[]

### hardkasVersion

> **hardkasVersion**: `string`

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

### inputs

> **inputs**: `object`[]

### lane?

> `optional` **lane?**: `string`

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

### maxFeeSompi?

> `optional` **maxFeeSompi?**: `string`

### metadata?

> `optional` **metadata?**: `any`

### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

### nextState?

> `optional` **nextState?**: (\{ `covenantId`: `string`; `input`: `number`; `outputs`: `number`[]; `successor`: \{ `artifactSha256`: `string`; `constructorArgs`: `unknown`[]; `state`: `Record`\<`string`, `unknown`\>; `stateToConstructorArg`: `Record`\<`string`, `number`\>; \}; \} \| \{ `covenantId`: `string`; `input`: `number`; `outputs`: `number`[]; `states`: `Record`\<`string`, `unknown`\>[]; \})[]

### outputs

> **outputs**: `object`[]

### parents?

> `optional` **parents?**: `string`[]

### payload?

> `optional` **payload?**: `string`

### planId

> **planId**: `string`

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

### schema

> **schema**: `"hardkas.txPlan"`

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

### storageMass?

> `optional` **storageMass?**: `string`

### to

> **to**: `object`

#### to.accountName?

> `optional` **accountName?**: `string`

#### to.address

> **address**: `string`

#### to.input?

> `optional` **input?**: `string`

### txVersion?

> `optional` **txVersion?**: `0` \| `1`

### version

> **version**: `"1.0.0-alpha"`

### workflowId?

> `optional` **workflowId?**: `string`
