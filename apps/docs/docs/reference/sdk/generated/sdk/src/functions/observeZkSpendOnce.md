[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / observeZkSpendOnce

# Function: observeZkSpendOnce()

> **observeZkSpendOnce**(`client`, `params`): `Promise`\<\{ `derivedStatus`: `DerivedTxStatus`; `observation`: \{ `assumptionLevel?`: `string`; `contentHash?`: `string`; `createdAt`: `string`; `evidence`: `object`[]; `execution?`: \{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network`: `string`; \}; `finding`: \{ `feeSompi?`: `string`; `isOrphan`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"mempool_entry"`; \} \| \{ `type`: `"mempool_absent"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type`: `"chain_accepted"`; \} \| \{ `acceptingBlockHash`: `string`; `type`: `"chain_removed"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `confirmationsBlue`: `string`; `finalityDepth`: `string`; `type`: `"finality_reached"`; \} \| \{ `reason`: `string`; `type`: `"pruned_unobservable"`; \} \| \{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"not_found"`; \} \| \{ `receiptArtifactId`: `string`; `type`: `"synthetic_executed"`; \}; `hardkasVersion`: `string`; `hashVersion?`: `string` \| `number`; `lineage?`: \{ `artifactId`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \}; `lineageDepth?`: `number`; `metadata?`: `any`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observedAt`: `string`; `observer`: \{ `capabilities`: \{ `prunedBelowBlueScore?`: `string`; `reorgAware`: `boolean`; \}; `description`: `string`; `kind`: `"rpc"` \| `"synthetic"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observerId`: `string`; `serverVersion?`: `string`; \}; `parents?`: `string`[]; `point`: \{ `pruningPointHash?`: `string`; `sinkBlueScore`: `string`; `sinkHash`: `string`; `virtualDaaScore`: `string`; \}; `rpcUrl?`: `string`; `schema`: `"hardkas.txObservation.v1"`; `schemaVersion?`: `string`; `scriptCapabilities?`: (`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]; `scriptMetadata?`: \{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}; `scriptProfile?`: `"standard"` \| `"experimental"`; `subject`: \{ `submissionArtifactId?`: `string`; `txId`: `string`; \}; `version`: `"1.0.0-alpha"`; `workflowId?`: `string`; \}; `zkStatus?`: [`ZkOperationStatusResult`](../interfaces/ZkOperationStatusResult.md); \}\>

Defined in: [packages/sdk/src/zk/toccata.ts:1794](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L1794)

Observes a Toccata ZK transaction using HardKAS's common TxObserver pipeline and
derives both the base transaction status and the unified ZK operation status.

## Parameters

### client

`KaspaRpcClient`

### params

#### mode?

`"rpc"` \| `"simulator"` \| `"localnet"`

#### networkId?

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

#### observerId?

`string`

#### txId

`string`

#### zkFact?

\{ `computeBudget`: `number`; `contentHash?`: `string`; `curve`: `"BN254"`; `draftArtifactId?`: `string`; `feeSompi`: `string`; `guestSystem`: `"custom"` \| `"RISC Zero"`; `hardkasVersion`: `string`; `hashVersion`: `string` \| `number`; `imageId`: `string`; `journalHash`: `string`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `offChainVerification?`: `"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`; `offChainVerifier?`: `string`; `p2shAddress`: `string`; `payoutAddress`: `string`; `payoutSompi`: `string`; `planArtifactId?`: `string`; `proofSha256`: `string`; `provingSystem`: `"Groth16"`; `redeemScriptHash`: `string`; `schema`: `"hardkas.zkVerificationFact.v1"`; `spendUtxo`: \{ `amountSompi`: `string`; `index`: `number`; `transactionId`: `string`; \}; `timestamp?`: `string`; `txId`: `string`; `verifiedOffChain`: `boolean`; \}

#### zkFact.computeBudget

`number`

#### zkFact.contentHash?

`string`

#### zkFact.curve

`"BN254"`

#### zkFact.draftArtifactId?

`string`

#### zkFact.feeSompi

`string`

#### zkFact.guestSystem

`"custom"` \| `"RISC Zero"`

#### zkFact.hardkasVersion

`string`

#### zkFact.hashVersion

`string` \| `number`

#### zkFact.imageId

`string`

#### zkFact.journalHash

`string`

#### zkFact.networkId

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

#### zkFact.offChainVerification?

`"VERIFIED"` \| `"NOT_PERFORMED"` \| `"FAILED"`

#### zkFact.offChainVerifier?

`string`

#### zkFact.p2shAddress

`string`

#### zkFact.payoutAddress

`string`

#### zkFact.payoutSompi

`string`

#### zkFact.planArtifactId?

`string`

#### zkFact.proofSha256

`string`

#### zkFact.provingSystem

`"Groth16"`

#### zkFact.redeemScriptHash

`string`

#### zkFact.schema

`"hardkas.zkVerificationFact.v1"`

#### zkFact.spendUtxo

\{ `amountSompi`: `string`; `index`: `number`; `transactionId`: `string`; \}

#### zkFact.spendUtxo.amountSompi

`string`

#### zkFact.spendUtxo.index

`number`

#### zkFact.spendUtxo.transactionId

`string`

#### zkFact.timestamp?

`string`

#### zkFact.txId

`string`

#### zkFact.verifiedOffChain

`boolean`

## Returns

`Promise`\<\{ `derivedStatus`: `DerivedTxStatus`; `observation`: \{ `assumptionLevel?`: `string`; `contentHash?`: `string`; `createdAt`: `string`; `evidence`: `object`[]; `execution?`: \{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network`: `string`; \}; `finding`: \{ `feeSompi?`: `string`; `isOrphan`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"mempool_entry"`; \} \| \{ `type`: `"mempool_absent"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type`: `"chain_accepted"`; \} \| \{ `acceptingBlockHash`: `string`; `type`: `"chain_removed"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `confirmationsBlue`: `string`; `finalityDepth`: `string`; `type`: `"finality_reached"`; \} \| \{ `reason`: `string`; `type`: `"pruned_unobservable"`; \} \| \{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"not_found"`; \} \| \{ `receiptArtifactId`: `string`; `type`: `"synthetic_executed"`; \}; `hardkasVersion`: `string`; `hashVersion?`: `string` \| `number`; `lineage?`: \{ `artifactId`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \}; `lineageDepth?`: `number`; `metadata?`: `any`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observedAt`: `string`; `observer`: \{ `capabilities`: \{ `prunedBelowBlueScore?`: `string`; `reorgAware`: `boolean`; \}; `description`: `string`; `kind`: `"rpc"` \| `"synthetic"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observerId`: `string`; `serverVersion?`: `string`; \}; `parents?`: `string`[]; `point`: \{ `pruningPointHash?`: `string`; `sinkBlueScore`: `string`; `sinkHash`: `string`; `virtualDaaScore`: `string`; \}; `rpcUrl?`: `string`; `schema`: `"hardkas.txObservation.v1"`; `schemaVersion?`: `string`; `scriptCapabilities?`: (`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]; `scriptMetadata?`: \{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}; `scriptProfile?`: `"standard"` \| `"experimental"`; `subject`: \{ `submissionArtifactId?`: `string`; `txId`: `string`; \}; `version`: `"1.0.0-alpha"`; `workflowId?`: `string`; \}; `zkStatus?`: [`ZkOperationStatusResult`](../interfaces/ZkOperationStatusResult.md); \}\>
