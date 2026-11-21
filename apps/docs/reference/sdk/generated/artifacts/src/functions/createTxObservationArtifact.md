[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createTxObservationArtifact

# Function: createTxObservationArtifact()

> **createTxObservationArtifact**(`input`, `ctx`): `object`

Defined in: [packages/artifacts/src/tx-observation.ts:126](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-observation.ts#L126)

Seals ONE observation (v5, FULL). No lineage (IC-2′.5). Refuses an incoherent
observation instead of persisting a fact that contradicts itself.

## Parameters

### input

[`TxObservationInput`](../interfaces/TxObservationInput.md)

### ctx

`RuntimeContext`

## Returns

`object`

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

### contentHash?

> `optional` **contentHash?**: `string`

### createdAt

> **createdAt**: `string`

### evidence

> **evidence**: `object`[]

### execution?

> `optional` **execution?**: `object`

#### execution.domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### execution.mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`

#### execution.network

> **network**: `string`

### finding?

> `optional` **finding?**: \{ `feeSompi?`: `string`; `isOrphan`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"mempool_entry"`; \} \| \{ `type`: `"mempool_absent"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type`: `"chain_accepted"`; \} \| \{ `acceptingBlockHash`: `string`; `type`: `"chain_removed"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `confirmationsBlue`: `string`; `finalityDepth`: `string`; `type`: `"finality_reached"`; \} \| \{ `reason`: `string`; `type`: `"pruned_unobservable"`; \} \| \{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"not_found"`; \} \| \{ `receiptArtifactId`: `string`; `type`: `"synthetic_executed"`; \} = `TxObservationFindingSchema`

#### Union Members

##### Type Literal

\{ `feeSompi?`: `string`; `isOrphan`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"mempool_entry"`; \}

##### feeSompi?

> `optional` **feeSompi?**: `string`

##### isOrphan

> **isOrphan**: `boolean`

##### scanComplete?

> `optional` **scanComplete?**: `boolean`

##### scannedChainBlocks?

> `optional` **scannedChainBlocks?**: `number`

##### scannedFrom?

> `optional` **scannedFrom?**: `string`

MEMPOOL-CHAIN-PRECEDENCE-FIX-1: the chain window the same look read (absent in historical observations and when
the node served no batch). `scannedTo` is the last chain block read — the next cursor; `scanComplete` is false when
the scan stopped before the node's selected-chain tip.

##### scannedTo?

> `optional` **scannedTo?**: `string`

##### type

> **type**: `"mempool_entry"`

***

##### Type Literal

\{ `type`: `"mempool_absent"`; \}

***

##### Type Literal

\{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type`: `"chain_accepted"`; \}

##### acceptingBlockHash

> **acceptingBlockHash**: `string`

##### acceptingBlueScore

> **acceptingBlueScore**: `string` = `decimalString`

##### acceptingDaaScore?

> `optional` **acceptingDaaScore?**: `string`

##### confirmationsBlue

> **confirmationsBlue**: `string` = `decimalString`

##### confirmationsDaa?

> `optional` **confirmationsDaa?**: `string`

##### removedAcceptingBlockHash?

> `optional` **removedAcceptingBlockHash?**: `string`

The block this observer previously saw accepting the transaction, which the SAME node answer
reported off the selected chain: the acceptance moved to `acceptingBlockHash`, it was not lost.

##### type

> **type**: `"chain_accepted"`

***

##### Type Literal

\{ `acceptingBlockHash`: `string`; `type`: `"chain_removed"`; \}

***

##### Type Literal

\{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `confirmationsBlue`: `string`; `finalityDepth`: `string`; `type`: `"finality_reached"`; \}

***

##### Type Literal

\{ `reason`: `string`; `type`: `"pruned_unobservable"`; \}

***

##### Type Literal

\{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"not_found"`; \}

##### scannedChainBlocks?

> `optional` **scannedChainBlocks?**: `number`

##### scannedFrom?

> `optional` **scannedFrom?**: `string`

##### scannedTo?

> `optional` **scannedTo?**: `string`

The last chain block the scan reached: the next observation's cursor.

##### type

> **type**: `"not_found"`

***

##### Type Literal

\{ `receiptArtifactId`: `string`; `type`: `"synthetic_executed"`; \}

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

### observedAt

> **observedAt**: `string`

### observer

> **observer**: `object`

#### observer.capabilities

> **capabilities**: `object`

#### observer.capabilities.prunedBelowBlueScore?

> `optional` **prunedBelowBlueScore?**: `string`

#### observer.capabilities.reorgAware

> **reorgAware**: `boolean`

#### observer.description

> **description**: `string`

Interim until D-Q1.a: describes the observer; it does NOT identify a node cryptographically.

#### observer.kind

> **kind**: `"rpc"` \| `"synthetic"`

#### observer.networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

#### observer.observerId

> **observerId**: `string`

Opaque, stable identity of the HardKAS observer INSTANCE (Wave 2(a) security
review): "these observations come from the same logical observer", so that a
temporal history is only ever derived within one observer. It does NOT identify
a node cryptographically (D-Q1.a stays blocked).

#### observer.serverVersion?

> `optional` **serverVersion?**: `string`

### parents?

> `optional` **parents?**: `string`[]

### point

> **point**: `object` = `TxObservationPointSchema`

#### point.pruningPointHash?

> `optional` **pruningPointHash?**: `string`

#### point.sinkBlueScore

> **sinkBlueScore**: `string` = `decimalString`

#### point.sinkHash

> **sinkHash**: `string`

#### point.virtualDaaScore

> **virtualDaaScore**: `string` = `decimalString`

### rpcUrl?

> `optional` **rpcUrl?**: `string`

### schema

> **schema**: `"hardkas.txObservation.v1"`

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

### subject

> **subject**: `object`

#### subject.submissionArtifactId?

> `optional` **submissionArtifactId?**: `string`

#### subject.txId

> **txId**: `string`

### version

> **version**: `"1.0.0-alpha"`

### workflowId?

> `optional` **workflowId?**: `string`
