[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createSimulatedTxReceipt

# Function: createSimulatedTxReceipt()

> **createSimulatedTxReceipt**(`plan`, `txId`, `ctx`, `extra?`): `object`

Defined in: [packages/artifacts/src/signed-tx.ts:78](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/signed-tx.ts#L78)

Creates a canonical simulated receipt.

DEF-1c (Wave 1 continuation): the receipt's `lineage.parentArtifactId` MUST
be an artifact hash (per the lineage contract). Previously, this function
overrode `parentArtifactId` with `preStateHash` — a state-machine hash from a
DIFFERENT hash space — which caused every persisted simulator receipt to
declare an unresolvable HardKAS parent. `preStateHash` and `postStateHash`
remain first-class execution/state evidence fields on the receipt; they are
never interpreted as artifact IDs.

The `extra` bag also now accepts schema-owned lifecycle fields (already
declared on `TxReceiptSchema` — `submittedAt`, `confirmedAt`, `rpcUrl`,
`tracePath`, `sourceSignedId`) so callers can populate the single canonical
receipt identity in one construction, rather than building a second wrapper
receipt with its own contentHash. Optional `parentArtifact` overrides the
lineage predecessor when the caller executed/submitted a signed artifact
rather than a plan (the plan remains referenced via `sourceSignedId` →
signed.sourcePlanId indirection preserved by the signed artifact).

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

### txId

`string`

### ctx

`RuntimeContext`

### extra?

#### confirmedAt?

`string`

#### createdUtxoIds?

`string`[]

#### daaScore?

`string`

#### dagContext?

\{ `acceptedTxIds?`: `string`[]; `branchId?`: `string`; `conflictSet?`: `object`[]; `displacedTxIds?`: `string`[]; `mode?`: `"linear"` \| `"dag-light"`; `nonSelectedContext?`: `boolean`; `selectedParent?`: `string`; `sink?`: `string`; \}

#### dagContext.acceptedTxIds?

`string`[] = `...`

#### dagContext.branchId?

`string` = `...`

#### dagContext.conflictSet?

`object`[] = `...`

#### dagContext.displacedTxIds?

`string`[] = `...`

#### dagContext.mode?

`"linear"` \| `"dag-light"` = `...`

#### dagContext.nonSelectedContext?

`boolean` = `...`

#### dagContext.selectedParent?

`string` = `...`

#### dagContext.sink?

`string` = `...`

#### parentArtifact?

\{ `contentHash`: `string`; `lineage?`: `any`; \}

#### parentArtifact.contentHash

`string`

#### parentArtifact.lineage?

`any`

#### postStateHash?

`string`

#### preStateHash?

`string`

#### rpcUrl?

`string`

#### sourceSignedId?

`string`

#### spentUtxoIds?

`string`[]

#### submittedAt?

`string`

#### tracePath?

`string`

## Returns

`object`

### amountSompi?

> `optional` **amountSompi?**: `string`

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

### changeSompi?

> `optional` **changeSompi?**: `string`

### computeBudget?

> `optional` **computeBudget?**: `string`

### confirmedAt?

> `optional` **confirmedAt?**: `string`

### contentHash?

> `optional` **contentHash?**: `string`

### createdAt?

> `optional` **createdAt?**: `string`

### createdUtxoIds?

> `optional` **createdUtxoIds?**: `string`[]

### daaScore?

> `optional` **daaScore?**: `string`

### dagContext?

> `optional` **dagContext?**: `object`

#### dagContext.acceptedTxIds?

> `optional` **acceptedTxIds?**: `string`[]

#### dagContext.branchId?

> `optional` **branchId?**: `string`

#### dagContext.conflictSet?

> `optional` **conflictSet?**: `object`[]

#### dagContext.displacedTxIds?

> `optional` **displacedTxIds?**: `string`[]

#### dagContext.mode?

> `optional` **mode?**: `"linear"` \| `"dag-light"`

#### dagContext.nonSelectedContext?

> `optional` **nonSelectedContext?**: `boolean`

#### dagContext.selectedParent?

> `optional` **selectedParent?**: `string`

#### dagContext.sink?

> `optional` **sink?**: `string`

### errors?

> `optional` **errors?**: `string`[]

### execution?

> `optional` **execution?**: `object` = `executionTargetSchema`

#### execution.domain?

> `optional` **domain?**: `"kaspa-l1"` \| `"evm-l2"`

#### execution.mode?

> `optional` **mode?**: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`

#### execution.network?

> `optional` **network?**: `string`

### feeSompi?

> `optional` **feeSompi?**: `string`

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

### mass?

> `optional` **mass?**: `string`

### metadata?

> `optional` **metadata?**: `any`

### mode?

> `optional` **mode?**: `"rpc"` \| `"simulator"` \| `"localnet"` = `executionModeSchema`

### networkId?

> `optional` **networkId?**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

### parents?

> `optional` **parents?**: `string`[]

### postStateHash?

> `optional` **postStateHash?**: `string`

### preStateHash?

> `optional` **preStateHash?**: `string`

### rpcUrl?

> `optional` **rpcUrl?**: `string`

### schema?

> `optional` **schema?**: `"hardkas.txReceipt"`

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

### sourceSignedId?

> `optional` **sourceSignedId?**: `string`

### spentUtxoIds?

> `optional` **spentUtxoIds?**: `string`[]

### status?

> `optional` **status?**: `"submitted"` \| `"accepted"` \| `"confirmed"` \| `"failed"`

### storageMass?

> `optional` **storageMass?**: `string`

### submittedAt?

> `optional` **submittedAt?**: `string`

### to?

> `optional` **to?**: `object` = `AccountRefSchema`

#### to.accountName?

> `optional` **accountName?**: `string`

#### to.address?

> `optional` **address?**: `string`

#### to.input?

> `optional` **input?**: `string`

### tracePath?

> `optional` **tracePath?**: `string`

### txId?

> `optional` **txId?**: `string`

### txVersion?

> `optional` **txVersion?**: `0` \| `1`

### version?

> `optional` **version?**: `"1.0.0-alpha"`

### workflowId?

> `optional` **workflowId?**: `string`
