[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasTx

# Class: HardkasTx

Defined in: [packages/sdk/src/tx.ts:437](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L437)

## Constructors

### Constructor

> **new HardkasTx**(`sdk`): `HardkasTx`

Defined in: [packages/sdk/src/tx.ts:438](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L438)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasTx`

## Methods

### appendSignature()

> **appendSignature**(`plan`, `account?`): `Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:2891](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L2891)

Explicitly appends a signature to a partially signed transaction.

#### Parameters

##### plan

[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)

##### account?

`string` \| `HardkasAccount`

#### Returns

`Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

***

### createConsolidationPlan()

> **createConsolidationPlan**(`options`): `Promise`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:990](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L990)

Creates a transaction plan explicitly for consolidation.
This overrides normal selection logic and uses precisely the provided UTXOs.

#### Parameters

##### options

###### account

`string` \| `HardkasAccount`

###### destination

`string`

###### feeRate?

`bigint`

###### maxFeeSompi?

`string` \| `number` \| `bigint`

TX-FEE-GUARD-1: see `plan({ maxFeeSompi })`.

###### network?

`string`

###### selectedUtxos

`any`[]

###### totalUtxosSeen?

`number`

#### Returns

`Promise`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

***

### observe()

> **observe**(`txId`, `options?`): `Promise`\<\{ `derived`: `DerivedTxStatus`; `observation`: \{ `assumptionLevel?`: `string`; `contentHash?`: `string`; `createdAt`: `string`; `evidence`: `object`[]; `execution?`: \{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network`: `string`; \}; `finding`: \{ `feeSompi?`: `string`; `isOrphan`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"mempool_entry"`; \} \| \{ `type`: `"mempool_absent"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type`: `"chain_accepted"`; \} \| \{ `acceptingBlockHash`: `string`; `type`: `"chain_removed"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `confirmationsBlue`: `string`; `finalityDepth`: `string`; `type`: `"finality_reached"`; \} \| \{ `reason`: `string`; `type`: `"pruned_unobservable"`; \} \| \{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"not_found"`; \} \| \{ `receiptArtifactId`: `string`; `type`: `"synthetic_executed"`; \}; `hardkasVersion`: `string`; `hashVersion?`: `string` \| `number`; `lineage?`: \{ `artifactId`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \}; `lineageDepth?`: `number`; `metadata?`: `any`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observedAt`: `string`; `observer`: \{ `capabilities`: \{ `prunedBelowBlueScore?`: `string`; `reorgAware`: `boolean`; \}; `description`: `string`; `kind`: `"rpc"` \| `"synthetic"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observerId`: `string`; `serverVersion?`: `string`; \}; `parents?`: `string`[]; `point`: \{ `pruningPointHash?`: `string`; `sinkBlueScore`: `string`; `sinkHash`: `string`; `virtualDaaScore`: `string`; \}; `rpcUrl?`: `string`; `schema`: `"hardkas.txObservation.v1"`; `schemaVersion?`: `string`; `scriptCapabilities?`: (`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]; `scriptMetadata?`: \{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}; `scriptProfile?`: `"standard"` \| `"experimental"`; `subject`: \{ `submissionArtifactId?`: `string`; `txId`: `string`; \}; `version`: `"1.0.0-alpha"`; `workflowId?`: `string`; \}; `observationPath?`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:450](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L450)

Wave 2(a) · Q4 / IC-2′: ONE look at the configured node about `txId`, sealed and
(by default) persisted as `hardkas.txObservation.v1`. The observer's cursor is,
in order: `since`, the latest position a stored look verified (`verifiedCursor`), the
submission's `submitPoint.sinkHash`, the node's pruning point. Nothing here decides a state.

TN10-CONFIRMATION-FIX-1: an explicit `since` (a 64-hex chain block hash the caller knows precedes the acceptance)
lets a transaction sent outside this workspace — no submission recorded here — be observed without inventing a
receipt. When the node cannot serve the chain from it, `OBSERVE_SINCE_UNAVAILABLE` is thrown and nothing is sealed.

#### Parameters

##### txId

`string`

##### options?

###### maxBatches?

`number`

###### persist?

`boolean`

###### policy?

`TxStatusPolicy`

###### rpcUrl?

`string`

###### since?

`string`

#### Returns

`Promise`\<\{ `derived`: `DerivedTxStatus`; `observation`: \{ `assumptionLevel?`: `string`; `contentHash?`: `string`; `createdAt`: `string`; `evidence`: `object`[]; `execution?`: \{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network`: `string`; \}; `finding`: \{ `feeSompi?`: `string`; `isOrphan`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"mempool_entry"`; \} \| \{ `type`: `"mempool_absent"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type`: `"chain_accepted"`; \} \| \{ `acceptingBlockHash`: `string`; `type`: `"chain_removed"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `confirmationsBlue`: `string`; `finalityDepth`: `string`; `type`: `"finality_reached"`; \} \| \{ `reason`: `string`; `type`: `"pruned_unobservable"`; \} \| \{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"not_found"`; \} \| \{ `receiptArtifactId`: `string`; `type`: `"synthetic_executed"`; \}; `hardkasVersion`: `string`; `hashVersion?`: `string` \| `number`; `lineage?`: \{ `artifactId`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \}; `lineageDepth?`: `number`; `metadata?`: `any`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observedAt`: `string`; `observer`: \{ `capabilities`: \{ `prunedBelowBlueScore?`: `string`; `reorgAware`: `boolean`; \}; `description`: `string`; `kind`: `"rpc"` \| `"synthetic"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observerId`: `string`; `serverVersion?`: `string`; \}; `parents?`: `string`[]; `point`: \{ `pruningPointHash?`: `string`; `sinkBlueScore`: `string`; `sinkHash`: `string`; `virtualDaaScore`: `string`; \}; `rpcUrl?`: `string`; `schema`: `"hardkas.txObservation.v1"`; `schemaVersion?`: `string`; `scriptCapabilities?`: (`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]; `scriptMetadata?`: \{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}; `scriptProfile?`: `"standard"` \| `"experimental"`; `subject`: \{ `submissionArtifactId?`: `string`; `txId`: `string`; \}; `version`: `"1.0.0-alpha"`; `workflowId?`: `string`; \}; `observationPath?`: `string`; \}\>

***

### observerId()

> **observerId**(): `string`

Defined in: [packages/sdk/src/tx.ts:533](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L533)

The opaque, stable identity of THIS SDK instance's RPC observer: a digest of the
configured target and its raw locator (never exposed). Same configuration ⇒ same
observer ⇒ one history; a different node configuration is a different observer.

#### Returns

`string`

***

### plan()

> **plan**(`options`): `Promise`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:641](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L641)

Plans a transaction.

#### Parameters

##### options

###### amount

`string` \| `number` \| `bigint`

L1-11 · units: a `string` is KAS ("1.5"; "all" consolidates), a `bigint` is SOMPI (150_000_000n), and a `number`
is KAS (1.5) — unlike `parseKasToSompi(number)` of @hardkas/core, which reads a number as sompi. A number is
ambiguous across the two APIs and loses precision past 2^53: pass a string (KAS) or a bigint (sompi). Passing a
number emits a one-time process warning (HARDKAS_AMOUNT_NUMBER_IS_KAS).

###### assumption?

`string`

###### changeAddress?

`string`

AUD-28: explicit change destination; default = the sender's address. Validated, then forwarded to the planner.

###### feeRate?

`bigint`

Sompi per gram. Default: the node's fee estimate for "normal" priority (bounded, FEE_RATE_ABOVE_BOUND above
`networks[<net>].maxFeeRate`, default 10,000), never below the relay minimum; at the minimum the plan pays the relay
minimum on the compute mass (FEE-POLICY-1, HK-09).

###### from

`string` \| `HardkasAccount`

###### maxFeeSompi?

`string` \| `number` \| `bigint`

TX-FEE-GUARD-1: the most this transaction may pay in total, in sompi. Refused with FEE_EXCEEDS_MAX when the
planned fee is above it (or above the workspace's `networks[<net>].maxFeeSompi`, the lower one applies); recorded
in the plan and enforced again at sign and send. Optional: without it (and without a network limit) HardKAS's
default limit applies (`DEFAULT_MAX_FEE_SOMPI`, 10,000,000 sompi = 0.1 KAS; TX-05).

###### networkProfile?

`string`

###### policy?

`string`

###### to

`string` \| `HardkasAccount`

###### workflowId?

`string`

#### Returns

`Promise`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

***

### send()

> **send**(`signedArtifact`, `urlOrOptions?`): `Promise`\<\{ `alreadySubmitted?`: `boolean`; `artifactId?`: `string`; `derived?`: `DerivedTxStatus`; `mode?`: `string`; `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md) \| `TxSubmissionArtifact`; `receiptPath?`: `string`; `rejection?`: `NodeRejection`; `simulated?`: `boolean`; `submission?`: `TxSubmissionArtifact`; `submitted?`: `boolean`; `txId?`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:2044](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L2044)

Sends a signed transaction to the real RPC network.

#### Parameters

##### signedArtifact

[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)

##### urlOrOptions?

`string` \| `SendTxOptions`

#### Returns

`Promise`\<\{ `alreadySubmitted?`: `boolean`; `artifactId?`: `string`; `derived?`: `DerivedTxStatus`; `mode?`: `string`; `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md) \| `TxSubmissionArtifact`; `receiptPath?`: `string`; `rejection?`: `NodeRejection`; `simulated?`: `boolean`; `submission?`: `TxSubmissionArtifact`; `submitted?`: `boolean`; `txId?`: `string`; \}\>

***

### sign()

#### Call Signature

> **sign**(`plan`, `options?`): `Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:1128](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L1128)

Signs a transaction plan.

##### Parameters

###### plan

[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md) \| [`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)

###### options?

`SignTxOptions`

##### Returns

`Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

#### Call Signature

> **sign**(`plan`, `account`, `options?`): `Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:1136](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L1136)

##### Parameters

###### plan

[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md) \| [`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)

###### account

`any`

###### options?

`LegacySignTxOptions`

##### Returns

`Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

##### Deprecated

Pass options as the second argument instead.

***

### simulate()

> **simulate**(`target`, `options?`): `Promise`\<\{ `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md); `receiptPath?`: `string`; `tracePath?`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:1768](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L1768)

#### Parameters

##### target

`string` \| [`SignedTxArtifact`](../interfaces/SignedTxArtifact.md) \| `Partial`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

##### options?

###### persist?

`boolean`

###### plan?

[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)

#### Returns

`Promise`\<\{ `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md); `receiptPath?`: `string`; `tracePath?`: `string`; \}\>

***

### status()

> **status**(`txId`, `policy?`): `Promise`\<`DerivedTxStatus`\>

Defined in: [packages/sdk/src/tx.ts:2907](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L2907)

Wave 2(a) · Q4: the DERIVED state of `txId` from the evidence in this workspace
(the submission or simulator receipt plus every verified observation), under
`policy` (HardKAS product default unless given). No RPC call is made here; use
`observe()` to add evidence.

#### Parameters

##### txId

`string`

##### policy?

`TxStatusPolicy`

#### Returns

`Promise`\<`DerivedTxStatus`\>

***

### waitForAccepted()

> **waitForAccepted**(`options`): `Promise`\<\{ `acceptingBlockHash`: `string`; `confirmations`: `number`; `derived`: `DerivedTxStatus`; `status`: `string`; `txId`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:556](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L556)

Waits until the derived state is `ACCEPTED` (or deeper): observed acceptance by a
chain block. Each poll persists ONE observation; the state is derived, never stored.

#### Parameters

##### options

###### pollIntervalMs?

`number`

###### signal?

`AbortSignal`

###### timeoutMs?

`number`

###### txId

`string`

#### Returns

`Promise`\<\{ `acceptingBlockHash`: `string`; `confirmations`: `number`; `derived`: `DerivedTxStatus`; `status`: `string`; `txId`: `string`; \}\>

***

### waitForConfirmations()

> **waitForConfirmations**(`options`): `Promise`\<\{ `acceptingBlockHash`: `string`; `confirmations`: `number`; `confirmationUnit`: `string`; `derived`: `DerivedTxStatus`; `observedAtDaaScore`: `string`; `status`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:591](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/tx.ts#L591)

Waits until the observed blue-score depth of the accepting block reaches
`minConfirmations` (Q4 point 3: `sinkBlueScore − acceptingBlueScore`, the node's
own unit). `minConfirmations` is the caller's policy, not a Kaspa parameter.

#### Parameters

##### options

###### minConfirmations

`number`

###### pollIntervalMs?

`number`

###### signal?

`AbortSignal`

###### timeoutMs?

`number`

###### txId

`string`

#### Returns

`Promise`\<\{ `acceptingBlockHash`: `string`; `confirmations`: `number`; `confirmationUnit`: `string`; `derived`: `DerivedTxStatus`; `observedAtDaaScore`: `string`; `status`: `string`; \}\>
