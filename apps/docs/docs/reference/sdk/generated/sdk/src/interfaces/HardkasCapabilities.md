[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasCapabilities

# Interface: HardkasCapabilities

Defined in: [packages/sdk/src/capabilities.ts:4](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L4)

## Properties

### capabilities

> **capabilities**: `object`

Defined in: [packages/sdk/src/capabilities.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L9)

#### artifacts

> **artifacts**: `boolean`

#### atomicPersistence

> **atomicPersistence**: `boolean`

#### consensusValidation

> **consensusValidation**: `boolean`

#### corruptionDetection

> **corruptionDetection**: `boolean`

#### covenants

> **covenants**: `boolean`

#### dagConflictResolution

> **dagConflictResolution**: `boolean`

#### deterministicHashing

> **deterministicHashing**: `boolean`

#### differentialDagValidation

> **differentialDagValidation**: `boolean`

#### dockerNode

> **dockerNode**: `boolean`

#### ghostdagSimulation

> **ghostdagSimulation**: `boolean`

#### l2BridgeAssumptions

> **l2BridgeAssumptions**: `boolean`

#### l2Profiles

> **l2Profiles**: `boolean`

#### lineageVerification

> **lineageVerification**: `boolean`

#### localnetSimulation

> **localnetSimulation**: `boolean`

#### mainnetGuards

> **mainnetGuards**: `boolean`

#### massProfiler

> **massProfiler**: `boolean`

#### productionWallet

> **productionWallet**: `boolean`

#### queryStore

> **queryStore**: `boolean`

#### replayVerification

> **replayVerification**: `boolean`

#### schemaMigrations

> **schemaMigrations**: `boolean`

#### scriptRunner

> **scriptRunner**: `boolean`

#### secretRedaction

> **secretRedaction**: `boolean`

#### silverScript

> **silverScript**: `boolean`

#### simulationScenarios

> **simulationScenarios**: `boolean`

#### testingFramework

> **testingFramework**: `boolean`

#### transactionV1

> **transactionV1**: `boolean`

#### trustlessExit

> **trustlessExit**: `boolean`

#### workspaceLocks

> **workspaceLocks**: `boolean`

***

### hashVersion

> **hashVersion**: `number`

Defined in: [packages/sdk/src/capabilities.ts:8](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L8)

***

### maturity

> **maturity**: `"alpha"` \| `"hardened-alpha"` \| `"beta"` \| `"stable"`

Defined in: [packages/sdk/src/capabilities.ts:6](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L6)

***

### proofVersion

> **proofVersion**: `string`

Defined in: [packages/sdk/src/capabilities.ts:7](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L7)

***

### runtimeMatrix?

> `optional` **runtimeMatrix?**: `object`

Defined in: [packages/sdk/src/capabilities.ts:46](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L46)

#### docker

> **docker**: `object`

##### docker.cpuminerImage

> **cpuminerImage**: `string`

##### docker.kaspadImage

> **kaspadImage**: `string`

#### node

> **node**: `object`

##### node.covenants

> **covenants**: `boolean`

##### node.toccata

> **toccata**: `boolean`

##### node.txV1

> **txV1**: `boolean`

##### node.version

> **version**: `string`

#### wasm

> **wasm**: `object`

##### wasm.signingV1

> **signingV1**: `boolean`

##### wasm.txV1

> **txV1**: `boolean`

##### wasm.version

> **version**: `string`

***

### trustBoundaries

> **trustBoundaries**: `object`

Defined in: [packages/sdk/src/capabilities.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L39)

#### artifacts

> **artifacts**: `"internal-integrity-only"`

#### l2Bridge

> **l2Bridge**: `"pre-zk-assumptions"`

#### queryStore

> **queryStore**: `"rebuildable-read-model"`

#### replay

> **replay**: `"local-workflow-only"`

#### simulator

> **simulator**: `"local-simulation-only"`

***

### version

> **version**: `string`

Defined in: [packages/sdk/src/capabilities.ts:5](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L5)
