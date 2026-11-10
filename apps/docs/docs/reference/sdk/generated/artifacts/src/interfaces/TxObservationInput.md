[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / TxObservationInput

# Interface: TxObservationInput

Defined in: [packages/artifacts/src/tx-observation.ts:92](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L92)

## Properties

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

Defined in: [packages/artifacts/src/tx-observation.ts:103](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L103)

***

### evidence

> **evidence**: `object`[]

Defined in: [packages/artifacts/src/tx-observation.ts:100](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L100)

#### method?

> `optional` **method?**: `string`

#### params?

> `optional` **params?**: `any`

#### responseDigest?

> `optional` **responseDigest?**: `string` = `hex64`

***

### execution?

> `optional` **execution?**: `object`

Defined in: [packages/artifacts/src/tx-observation.ts:95](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L95)

#### domain?

> `optional` **domain?**: `"kaspa-l1"` \| `"evm-l2"`

#### mode?

> `optional` **mode?**: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`

#### network?

> `optional` **network?**: `string`

***

### finding

> **finding**: \{ `feeSompi?`: `string`; `isOrphan?`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type?`: `"mempool_entry"`; \} \| \{ `type?`: `"mempool_absent"`; \} \| \{ `acceptingBlockHash?`: `string`; `acceptingBlueScore?`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue?`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type?`: `"chain_accepted"`; \} \| \{ `acceptingBlockHash?`: `string`; `type?`: `"chain_removed"`; \} \| \{ `acceptingBlockHash?`: `string`; `acceptingBlueScore?`: `string`; `confirmationsBlue?`: `string`; `finalityDepth?`: `string`; `type?`: `"finality_reached"`; \} \| \{ `reason?`: `string`; `type?`: `"pruned_unobservable"`; \} \| \{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type?`: `"not_found"`; \} \| \{ `receiptArtifactId?`: `string`; `type?`: `"synthetic_executed"`; \}

Defined in: [packages/artifacts/src/tx-observation.ts:99](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L99)

#### Union Members

##### Type Literal

\{ `feeSompi?`: `string`; `isOrphan?`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type?`: `"mempool_entry"`; \}

##### feeSompi?

> `optional` **feeSompi?**: `string`

##### isOrphan?

> `optional` **isOrphan?**: `boolean`

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

##### type?

> `optional` **type?**: `"mempool_entry"`

***

##### Type Literal

\{ `type?`: `"mempool_absent"`; \}

***

##### Type Literal

\{ `acceptingBlockHash?`: `string`; `acceptingBlueScore?`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue?`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type?`: `"chain_accepted"`; \}

##### acceptingBlockHash?

> `optional` **acceptingBlockHash?**: `string`

##### acceptingBlueScore?

> `optional` **acceptingBlueScore?**: `string` = `decimalString`

##### acceptingDaaScore?

> `optional` **acceptingDaaScore?**: `string`

##### confirmationsBlue?

> `optional` **confirmationsBlue?**: `string` = `decimalString`

##### confirmationsDaa?

> `optional` **confirmationsDaa?**: `string`

##### removedAcceptingBlockHash?

> `optional` **removedAcceptingBlockHash?**: `string`

The block this observer previously saw accepting the transaction, which the SAME node answer
reported off the selected chain: the acceptance moved to `acceptingBlockHash`, it was not lost.

##### type?

> `optional` **type?**: `"chain_accepted"`

***

##### Type Literal

\{ `acceptingBlockHash?`: `string`; `type?`: `"chain_removed"`; \}

***

##### Type Literal

\{ `acceptingBlockHash?`: `string`; `acceptingBlueScore?`: `string`; `confirmationsBlue?`: `string`; `finalityDepth?`: `string`; `type?`: `"finality_reached"`; \}

***

##### Type Literal

\{ `reason?`: `string`; `type?`: `"pruned_unobservable"`; \}

***

##### Type Literal

\{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type?`: `"not_found"`; \}

##### scannedChainBlocks?

> `optional` **scannedChainBlocks?**: `number`

##### scannedFrom?

> `optional` **scannedFrom?**: `string`

##### scannedTo?

> `optional` **scannedTo?**: `string`

The last chain block the scan reached: the next observation's cursor.

##### type?

> `optional` **type?**: `"not_found"`

***

##### Type Literal

\{ `receiptArtifactId?`: `string`; `type?`: `"synthetic_executed"`; \}

***

### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

Defined in: [packages/artifacts/src/tx-observation.ts:94](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L94)

***

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

Defined in: [packages/artifacts/src/tx-observation.ts:93](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L93)

***

### observer

> **observer**: `object`

Defined in: [packages/artifacts/src/tx-observation.ts:97](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L97)

#### capabilities?

> `optional` **capabilities?**: `object`

##### capabilities.prunedBelowBlueScore?

> `optional` **prunedBelowBlueScore?**: `string`

##### capabilities.reorgAware?

> `optional` **reorgAware?**: `boolean`

#### description?

> `optional` **description?**: `string`

Interim until D-Q1.a: describes the observer; it does NOT identify a node cryptographically.

#### kind?

> `optional` **kind?**: `"rpc"` \| `"synthetic"`

#### networkId?

> `optional` **networkId?**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

#### observerId?

> `optional` **observerId?**: `string`

Opaque, stable identity of the HardKAS observer INSTANCE (Wave 2(a) security
review): "these observations come from the same logical observer", so that a
temporal history is only ever derived within one observer. It does NOT identify
a node cryptographically (D-Q1.a stays blocked).

#### serverVersion?

> `optional` **serverVersion?**: `string`

***

### point

> **point**: `object`

Defined in: [packages/artifacts/src/tx-observation.ts:98](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L98)

#### pruningPointHash?

> `optional` **pruningPointHash?**: `string`

#### sinkBlueScore?

> `optional` **sinkBlueScore?**: `string` = `decimalString`

#### sinkHash?

> `optional` **sinkHash?**: `string`

#### virtualDaaScore?

> `optional` **virtualDaaScore?**: `string` = `decimalString`

***

### rpcUrl?

> `optional` **rpcUrl?**: `string`

Defined in: [packages/artifacts/src/tx-observation.ts:101](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L101)

***

### subject

> **subject**: `object`

Defined in: [packages/artifacts/src/tx-observation.ts:96](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L96)

#### submissionArtifactId?

> `optional` **submissionArtifactId?**: `string`

#### txId?

> `optional` **txId?**: `string`

***

### workflowId?

> `optional` **workflowId?**: `string`

Defined in: [packages/artifacts/src/tx-observation.ts:102](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L102)
