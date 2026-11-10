[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ObserveTxOptions

# Interface: ObserveTxOptions

Defined in: [packages/sdk/src/tx-observer.ts:158](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L158)

## Properties

### assumptionLevel?

> `optional` **assumptionLevel?**: `string`

Defined in: [packages/sdk/src/tx-observer.ts:181](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L181)

***

### execution?

> `optional` **execution?**: `object`

Defined in: [packages/sdk/src/tx-observer.ts:178](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L178)

#### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`

#### network

> **network**: `string`

***

### maxBatches?

> `optional` **maxBatches?**: `number`

Defined in: [packages/sdk/src/tx-observer.ts:175](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L175)

Upper bound on `getVirtualChainFromBlock` batches per observation (each ≈ mergeset limit × 10 chain blocks).

***

### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

Defined in: [packages/sdk/src/tx-observer.ts:177](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L177)

***

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

Defined in: [packages/sdk/src/tx-observer.ts:176](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L176)

***

### observerId

> **observerId**: `string`

Defined in: [packages/sdk/src/tx-observer.ts:161](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L161)

Opaque, stable identity of THIS observer instance (`obs_<64hex>`): histories are derived per observer.

***

### previousAcceptingBlockHash?

> `optional` **previousAcceptingBlockHash?**: `string`

Defined in: [packages/sdk/src/tx-observer.ts:173](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L173)

Block hash previously observed as accepting, to detect its removal from the chain.

***

### rpcUrl?

> `optional` **rpcUrl?**: `string`

Defined in: [packages/sdk/src/tx-observer.ts:179](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L179)

***

### since?

> `optional` **since?**: `string`

Defined in: [packages/sdk/src/tx-observer.ts:165](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L165)

Chain block hash to scan the virtual chain from (the observer's cursor).

***

### sinceExplicit?

> `optional` **sinceExplicit?**: `boolean`

Defined in: [packages/sdk/src/tx-observer.ts:171](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L171)

TN10-CONFIRMATION-FIX-1: `since` was given by the caller (not derived from earlier evidence). When the node cannot
serve the virtual chain from it, the look throws `OBSERVE_SINCE_UNAVAILABLE` and seals nothing: an unknown or
pruned cursor says nothing about the transaction, so it is never recorded as a `pruned_unobservable` finding.

***

### submissionArtifactId?

> `optional` **submissionArtifactId?**: `string`

Defined in: [packages/sdk/src/tx-observer.ts:163](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L163)

The 64-hex artifactId of the submission this observation is about, when known.

***

### txId

> **txId**: `string`

Defined in: [packages/sdk/src/tx-observer.ts:159](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L159)

***

### workflowId?

> `optional` **workflowId?**: `string`

Defined in: [packages/sdk/src/tx-observer.ts:180](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx-observer.ts#L180)
