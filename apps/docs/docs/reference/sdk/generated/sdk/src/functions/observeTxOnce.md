[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / observeTxOnce

# Function: observeTxOnce()

> **observeTxOnce**(`recorder`, `options`, `ctx`): `Promise`\<\{ `assumptionLevel?`: `string`; `contentHash?`: `string`; `createdAt`: `string`; `evidence`: `object`[]; `execution?`: \{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network`: `string`; \}; `finding`: \{ `feeSompi?`: `string`; `isOrphan`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"mempool_entry"`; \} \| \{ `type`: `"mempool_absent"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type`: `"chain_accepted"`; \} \| \{ `acceptingBlockHash`: `string`; `type`: `"chain_removed"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `confirmationsBlue`: `string`; `finalityDepth`: `string`; `type`: `"finality_reached"`; \} \| \{ `reason`: `string`; `type`: `"pruned_unobservable"`; \} \| \{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"not_found"`; \} \| \{ `receiptArtifactId`: `string`; `type`: `"synthetic_executed"`; \}; `hardkasVersion`: `string`; `hashVersion?`: `string` \| `number`; `lineage?`: \{ `artifactId`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \}; `lineageDepth?`: `number`; `metadata?`: `any`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observedAt`: `string`; `observer`: \{ `capabilities`: \{ `prunedBelowBlueScore?`: `string`; `reorgAware`: `boolean`; \}; `description`: `string`; `kind`: `"rpc"` \| `"synthetic"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observerId`: `string`; `serverVersion?`: `string`; \}; `parents?`: `string`[]; `point`: \{ `pruningPointHash?`: `string`; `sinkBlueScore`: `string`; `sinkHash`: `string`; `virtualDaaScore`: `string`; \}; `rpcUrl?`: `string`; `schema`: `"hardkas.txObservation.v1"`; `schemaVersion?`: `string`; `scriptCapabilities?`: (`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]; `scriptMetadata?`: \{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}; `scriptProfile?`: `"standard"` \| `"experimental"`; `subject`: \{ `submissionArtifactId?`: `string`; `txId`: `string`; \}; `version`: `"1.0.0-alpha"`; `workflowId?`: `string`; \}\>

Defined in: [packages/sdk/src/tx-observer.ts:189](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L189)

ONE look at the node, sealed as ONE observation. Order of evidence: point
(DAG info + sink blue score) → mempool → virtual chain from `since` → accepting
block header → finality rule. Nothing here interprets; the finding is what was seen.

## Parameters

### recorder

[`TxObserverRpcRecorder`](../interfaces/TxObserverRpcRecorder.md)

### options

[`ObserveTxOptions`](../interfaces/ObserveTxOptions.md)

### ctx

`RuntimeContext`

## Returns

`Promise`\<\{ `assumptionLevel?`: `string`; `contentHash?`: `string`; `createdAt`: `string`; `evidence`: `object`[]; `execution?`: \{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network`: `string`; \}; `finding`: \{ `feeSompi?`: `string`; `isOrphan`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"mempool_entry"`; \} \| \{ `type`: `"mempool_absent"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type`: `"chain_accepted"`; \} \| \{ `acceptingBlockHash`: `string`; `type`: `"chain_removed"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `confirmationsBlue`: `string`; `finalityDepth`: `string`; `type`: `"finality_reached"`; \} \| \{ `reason`: `string`; `type`: `"pruned_unobservable"`; \} \| \{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"not_found"`; \} \| \{ `receiptArtifactId`: `string`; `type`: `"synthetic_executed"`; \}; `hardkasVersion`: `string`; `hashVersion?`: `string` \| `number`; `lineage?`: \{ `artifactId`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \}; `lineageDepth?`: `number`; `metadata?`: `any`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observedAt`: `string`; `observer`: \{ `capabilities`: \{ `prunedBelowBlueScore?`: `string`; `reorgAware`: `boolean`; \}; `description`: `string`; `kind`: `"rpc"` \| `"synthetic"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observerId`: `string`; `serverVersion?`: `string`; \}; `parents?`: `string`[]; `point`: \{ `pruningPointHash?`: `string`; `sinkBlueScore`: `string`; `sinkHash`: `string`; `virtualDaaScore`: `string`; \}; `rpcUrl?`: `string`; `schema`: `"hardkas.txObservation.v1"`; `schemaVersion?`: `string`; `scriptCapabilities?`: (`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]; `scriptMetadata?`: \{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}; `scriptProfile?`: `"standard"` \| `"experimental"`; `subject`: \{ `submissionArtifactId?`: `string`; `txId`: `string`; \}; `version`: `"1.0.0-alpha"`; `workflowId?`: `string`; \}\>
