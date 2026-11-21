[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasCapabilities

# Interface: HardkasCapabilities

Defined in: [packages/sdk/src/capabilities.ts:22](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L22)

## Properties

### capabilities

> **capabilities**: `object`

Defined in: [packages/sdk/src/capabilities.ts:27](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L27)

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

The real covenant builders are ready here: 1:1 auth-bound transitions only, built by
`hardkas silver covenant genesis|transition` (managed silverc + verified kaspa-wasm + the node those commands would
use proving its identity: the canonical localnet unless another node is given, INT9-C5). Not
general covenant support, and not the SDK's planning (`sdkCovenantPlanning`).

#### deterministicHashing

> **deterministicHashing**: `boolean`

#### differentialDagValidation

> **differentialDagValidation**: `boolean`

#### dockerNode

> **dockerNode**: `boolean`

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

#### sdkCovenantPlanning

> **sdkCovenantPlanning**: `boolean`

Generic covenant planning from the SDK (`covenants.planDeploy()`/`planSpend()`): false in this build, they refuse
with COVENANT_PLAN_UNSUPPORTED. It does NOT say the SDK plans no covenant transaction: the v1 engine does
(`covenants.planGenesis/planTransition/planContractDeploy/planContractSpend`, `sign`, `send`); see
`scopes.sdkCovenantPlanning` for what of it a node has certified (HK-15).

#### secretRedaction

> **secretRedaction**: `boolean`

#### silverScript

> **silverScript**: `boolean`

The SilverScript compiler: the managed silverc resolves (`hardkas silver compile`).

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

Defined in: [packages/sdk/src/capabilities.ts:26](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L26)

***

### maturity

> **maturity**: `"alpha"` \| `"hardened-alpha"` \| `"beta"` \| `"stable"`

Defined in: [packages/sdk/src/capabilities.ts:24](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L24)

***

### proofVersion

> **proofVersion**: `string`

Defined in: [packages/sdk/src/capabilities.ts:25](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L25)

***

### reasons?

> `optional` **reasons?**: `object`

Defined in: [packages/sdk/src/capabilities.ts:84](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L84)

Why an entry derived from this environment is false here (absent when it is true). `createHardkasCapabilities()`
probes nothing, so it marks them "not probed".

#### covenants?

> `optional` **covenants?**: `string`

#### silverScript?

> `optional` **silverScript?**: `string`

#### transactionV1?

> `optional` **transactionV1?**: `string`

***

### runtimeMatrix?

> `optional` **runtimeMatrix?**: `object`

Defined in: [packages/sdk/src/capabilities.ts:98](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L98)

#### docker

> **docker**: `object`

##### docker.cpuminerImage

> **cpuminerImage**: `string`

##### docker.kaspadImage

> **kaspadImage**: `string`

#### node

> **node**: `object`

The canonical localnet node, as its identity check observed it: "unknown" and false unless it was verified.

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

### scopes?

> `optional` **scopes?**: `object`

Defined in: [packages/sdk/src/capabilities.ts:75](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L75)

The concrete surface each programmability entry covers, so a boolean is never read as generic support
(SURFACE-TRUTH-1B: the compiler, the real covenant builders, and the SDK planning that is not supported).

#### covenants

> **covenants**: `string`

#### sdkCovenantPlanning

> **sdkCovenantPlanning**: `string`

#### silverScript

> **silverScript**: `string`

***

### trustBoundaries

> **trustBoundaries**: `object`

Defined in: [packages/sdk/src/capabilities.ts:89](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L89)

#### artifacts

> **artifacts**: `"internal-integrity-only"`

#### l2Bridge

> **l2Bridge**: `"pre-zk-assumptions"`

The Igra bridge model (Labs; not part of the L1 core).

#### queryStore

> **queryStore**: `"rebuildable-read-model"`

#### replay

> **replay**: `"local-simulator-only"`

`hardkas replay verify`: simulator-mode receipts, replayed locally (no node or consensus replay).

#### simulator

> **simulator**: `"local-simulation-only"`

***

### version

> **version**: `string`

Defined in: [packages/sdk/src/capabilities.ts:23](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L23)
