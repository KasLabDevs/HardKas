[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createSimulatedSignedTxArtifact

# Function: createSimulatedSignedTxArtifact()

> **createSimulatedSignedTxArtifact**(`plan`, `signer`, `ctx`): `object`

Defined in: [packages/artifacts/src/signed-tx.ts:98](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/signed-tx.ts#L98)

Creates the canonical synthetic authorization of `plan` by `signer` (the
simulator's "signed" artifact). The signer MUST be the plan's `from` (IC-6′.2,
`SIGNER_MISMATCH`); the plan MUST have a FULL identity (`PLAN_UNIDENTIFIED`,
`MIGRATION_REQUIRED`). The binding lives in the authenticated body:
`authorization.planArtifactId`, `lineage.parentArtifactId` and `txId`.

## Parameters

### plan

#### amountSompi

`string` = `...`

#### assumptionLevel?

`string` = `...`

#### assumptionRef?

`string` = `...`

#### change?

\{ `address`: `string`; `amountSompi`: `string`; \} = `...`

#### change.address

`string` = `...`

#### change.amountSompi

`string` = `...`

#### computeBudget?

`string` = `...`

#### contentHash?

`string` = `...`

#### covenantOutpoints?

`string`[] = `...`

#### createdAt

`string` = `...`

#### estimatedFeeSompi

`string` = `...`

#### estimatedMass

`string` = `...`

#### execution

\{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network`: `string`; \} = `executionTargetSchema`

#### execution.domain

`"kaspa-l1"` \| `"evm-l2"` = `...`

#### execution.mode

`"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"` = `...`

#### execution.network

`string` = `...`

#### from

\{ `accountName?`: `string`; `address`: `string`; `input?`: `string`; \} = `AccountRefSchema`

#### from.accountName?

`string` = `...`

#### from.address

`string` = `...`

#### from.input?

`string` = `...`

#### genesisCovenantGroups?

`object`[] = `...`

#### hardkasVersion

`string` = `...`

#### hashVersion?

`string` \| `number` = `...`

#### inputs

`object`[] = `...`

#### lane?

`string` = `...`

#### lineage?

\{ `artifactId`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \} = `...`

#### lineage.artifactId

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

#### lockTime?

\{ `daaScore`: `string`; `observedAt?`: \{ `pastMedianTimeMs?`: `string`; `virtualDaaScore?`: `string`; \}; \} \| \{ `observedAt?`: \{ `pastMedianTimeMs?`: `string`; `virtualDaaScore?`: `string`; \}; `timestampMs`: `string`; \} = `...`

#### maxFeeSompi?

`string` = `...`

#### metadata?

`any` = `...`

#### mode

`"rpc"` \| `"simulator"` \| `"localnet"` = `executionModeSchema`

#### networkId

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

#### networkProfileRef?

`string` = `...`

#### nextState?

(\{ `covenantId`: `string`; `input`: `number`; `outputs`: `number`[]; `successor`: \{ `artifactSha256`: `string`; `constructorArgs`: `unknown`[]; `state`: `Record`\<`string`, `unknown`\>; `stateToConstructorArg`: `Record`\<`string`, `number`\>; \}; \} \| \{ `covenantId`: `string`; `input`: `number`; `outputs`: `number`[]; `states`: `Record`\<`string`, `unknown`\>[]; \})[] = `...`

#### outputs

`object`[] = `...`

#### parents?

`string`[] = `...`

#### payload?

`string` = `...`

#### planId

`string` = `...`

#### plannerAuthority?

`"KASPA_WASM_GENERATOR"` \| `"SYNTHETIC_SIMULATOR"` \| `"HARDKAS_V1_PLANNER"` = `...`

#### plannerAuthorityDetail?

`string` = `...`

#### policyRef?

`string` = `...`

#### policyRefs?

`string`[] = `...`

#### rpcUrl?

`string` = `...`

#### schema

`"hardkas.txPlan"` = `...`

#### schemaVersion?

`string` = `...`

#### scriptCapabilities?

(`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[] = `...`

#### scriptMetadata?

\{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \} = `...`

#### scriptMetadata.consensusImpact?

`"experimental"` \| `"none"` = `...`

#### scriptMetadata.experimental

`boolean` = `...`

#### scriptMetadata.language?

`"native"` \| `"silverscript"` \| `"tockata"` = `...`

#### scriptMetadata.notes?

`string`[] = `...`

#### scriptMetadata.version?

`string` = `...`

#### scriptProfile?

`"standard"` \| `"experimental"` = `...`

#### storageMass?

`string` = `...`

#### to

\{ `accountName?`: `string`; `address`: `string`; `input?`: `string`; \} = `AccountRefSchema`

#### to.accountName?

`string` = `...`

#### to.address

`string` = `...`

#### to.input?

`string` = `...`

#### txVersion?

`0` \| `1` = `...`

#### version

`"1.0.0-alpha"` = `...`

#### workflowId?

`string` = `...`

### signer

[`SyntheticSigner`](../type-aliases/SyntheticSigner.md)

### ctx

`RuntimeContext`

## Returns

`object`

### amountSompi

> **amountSompi**: `string`

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

### authorization?

> `optional` **authorization?**: `object`

#### authorization.kind

> **kind**: `"synthetic"`

#### authorization.planArtifactId

> **planArtifactId**: `string`

#### authorization.signers

> **signers**: `string`[]

### computeBudget?

> `optional` **computeBudget?**: `string`

### contentHash?

> `optional` **contentHash?**: `string`

### createdAt

> **createdAt**: `string`

### execution

> **execution**: `object` = `executionTargetSchema`

#### execution.domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### execution.mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`

#### execution.network

> **network**: `string`

### from

> **from**: `object` = `AccountRefSchema`

#### from.accountName?

> `optional` **accountName?**: `string`

#### from.address

> **address**: `string`

#### from.input?

> `optional` **input?**: `string`

### hardkasVersion

> **hardkasVersion**: `string`

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

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

### metadata?

> `optional` **metadata?**: `any`

### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"` = `executionModeSchema`

### multisig?

> `optional` **multisig?**: `object`

#### multisig.requiredSigners

> **requiredSigners**: `string`[]

#### multisig.signatures

> **signatures**: `object`[]

#### multisig.threshold

> **threshold**: `number`

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

### parents?

> `optional` **parents?**: `string`[]

### schema

> **schema**: `"hardkas.signedTx"`

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

### signatureMetadata?

> `optional` **signatureMetadata?**: `object`[]

### signedId

> **signedId**: `string`

### signedTransaction?

> `optional` **signedTransaction?**: `object`

#### signedTransaction.format

> **format**: `string`

#### signedTransaction.payload

> **payload**: `string`

### sourcePlanId

> **sourcePlanId**: `string`

### status

> **status**: `"signed"` \| `"partially_signed"`

### storageMass?

> `optional` **storageMass?**: `string`

### to

> **to**: `object` = `AccountRefSchema`

#### to.accountName?

> `optional` **accountName?**: `string`

#### to.address

> **address**: `string`

#### to.input?

> `optional` **input?**: `string`

### txId?

> `optional` **txId?**: `string`

### txVersion?

> `optional` **txVersion?**: `0` \| `1`

### unsignedPayloadHash?

> `optional` **unsignedPayloadHash?**: `string`

### version

> **version**: `"1.0.0-alpha"`

### workflowId?

> `optional` **workflowId?**: `string`
