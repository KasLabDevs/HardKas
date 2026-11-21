[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasTx

# Class: HardkasTx

Defined in: [packages/sdk/src/tx.ts:591](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L591)

## Constructors

### Constructor

> **new HardkasTx**(`sdk`): `HardkasTx`

Defined in: [packages/sdk/src/tx.ts:592](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L592)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasTx`

## Methods

### appendSignature()

> **appendSignature**(`plan`, `account?`): `Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:3378](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L3378)

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

Defined in: [packages/sdk/src/tx.ts:1227](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L1227)

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

> **observe**(`txId`, `options?`): `Promise`\<\{ `derived`: `DerivedTxStatus`; `observation`: \{ `assumptionLevel?`: `string`; `contentHash?`: `string`; `createdAt`: `string`; `evidence`: `object`[]; `execution?`: \{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network`: `string`; \}; `finding?`: \{ `feeSompi?`: `string`; `isOrphan`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"mempool_entry"`; \} \| \{ `type`: `"mempool_absent"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type`: `"chain_accepted"`; \} \| \{ `acceptingBlockHash`: `string`; `type`: `"chain_removed"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `confirmationsBlue`: `string`; `finalityDepth`: `string`; `type`: `"finality_reached"`; \} \| \{ `reason`: `string`; `type`: `"pruned_unobservable"`; \} \| \{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"not_found"`; \} \| \{ `receiptArtifactId`: `string`; `type`: `"synthetic_executed"`; \}; `hardkasVersion`: `string`; `hashVersion?`: `string` \| `number`; `lineage?`: \{ `artifactId`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \}; `lineageDepth?`: `number`; `metadata?`: `any`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observedAt`: `string`; `observer`: \{ `capabilities`: \{ `prunedBelowBlueScore?`: `string`; `reorgAware`: `boolean`; \}; `description`: `string`; `kind`: `"rpc"` \| `"synthetic"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observerId`: `string`; `serverVersion?`: `string`; \}; `parents?`: `string`[]; `point`: \{ `pruningPointHash?`: `string`; `sinkBlueScore`: `string`; `sinkHash`: `string`; `virtualDaaScore`: `string`; \}; `rpcUrl?`: `string`; `schema`: `"hardkas.txObservation.v1"`; `schemaVersion?`: `string`; `scriptCapabilities?`: (`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]; `scriptMetadata?`: \{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}; `scriptProfile?`: `"standard"` \| `"experimental"`; `subject`: \{ `submissionArtifactId?`: `string`; `txId`: `string`; \}; `version`: `"1.0.0-alpha"`; `workflowId?`: `string`; \}; `observationPath?`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:604](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L604)

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

`Promise`\<\{ `derived`: `DerivedTxStatus`; `observation`: \{ `assumptionLevel?`: `string`; `contentHash?`: `string`; `createdAt`: `string`; `evidence`: `object`[]; `execution?`: \{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"` \| `"l2-rpc"`; `network`: `string`; \}; `finding?`: \{ `feeSompi?`: `string`; `isOrphan`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"mempool_entry"`; \} \| \{ `type`: `"mempool_absent"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type`: `"chain_accepted"`; \} \| \{ `acceptingBlockHash`: `string`; `type`: `"chain_removed"`; \} \| \{ `acceptingBlockHash`: `string`; `acceptingBlueScore`: `string`; `confirmationsBlue`: `string`; `finalityDepth`: `string`; `type`: `"finality_reached"`; \} \| \{ `reason`: `string`; `type`: `"pruned_unobservable"`; \} \| \{ `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type`: `"not_found"`; \} \| \{ `receiptArtifactId`: `string`; `type`: `"synthetic_executed"`; \}; `hardkasVersion`: `string`; `hashVersion?`: `string` \| `number`; `lineage?`: \{ `artifactId`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \}; `lineageDepth?`: `number`; `metadata?`: `any`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observedAt`: `string`; `observer`: \{ `capabilities`: \{ `prunedBelowBlueScore?`: `string`; `reorgAware`: `boolean`; \}; `description`: `string`; `kind`: `"rpc"` \| `"synthetic"`; `networkId`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `observerId`: `string`; `serverVersion?`: `string`; \}; `parents?`: `string`[]; `point`: \{ `pruningPointHash?`: `string`; `sinkBlueScore`: `string`; `sinkHash`: `string`; `virtualDaaScore`: `string`; \}; `rpcUrl?`: `string`; `schema`: `"hardkas.txObservation.v1"`; `schemaVersion?`: `string`; `scriptCapabilities?`: (`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]; `scriptMetadata?`: \{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}; `scriptProfile?`: `"standard"` \| `"experimental"`; `subject`: \{ `submissionArtifactId?`: `string`; `txId`: `string`; \}; `version`: `"1.0.0-alpha"`; `workflowId?`: `string`; \}; `observationPath?`: `string`; \}\>

***

### observerId()

> **observerId**(): `string`

Defined in: [packages/sdk/src/tx.ts:690](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L690)

The opaque, stable identity of THIS SDK instance's RPC observer: a digest of the
configured target and its raw locator (never exposed). Same configuration ⇒ same
observer ⇒ one history; a different node configuration is a different observer.

#### Returns

`string`

***

### plan()

> **plan**(`options`): `Promise`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:798](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L798)

Plans a transaction: one recipient (`to` + `amount`), or several recipients in ONE transaction (`outputs`; R4-T).

#### Parameters

##### options

###### amount?

`string` \| `number` \| `bigint`

L1-11 · units: a `string` is KAS ("1.5"; "all" consolidates), a `bigint` is SOMPI (150_000_000n), and a `number`
is KAS (1.5) — unlike `parseKasToSompi(number)` of @hardkas/core, which reads a number as sompi. A number is
ambiguous across the two APIs and loses precision past 2^53: pass a string (KAS) or a bigint (sompi). Passing a
number emits a one-time process warning (HARDKAS_AMOUNT_NUMBER_IS_KAS).
Required unless `outputs` is given; never together with it.

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

###### lockTime?

`LockTimeRequest`

CLTV · an absolute lock time, typed: `{ daaScore: bigint }` (a DAA score below 500,000,000,000) or
`{ timestampMs: bigint }` (milliseconds since the epoch, at or above it); never a bare number (LOCK_TIME_INVALID).
The plan records it with the node's virtual DAA score and past median time when it was made; the signer writes it
into the transaction (every input at sequence 0, so consensus enforces it) and `send` refuses to broadcast before
the node has passed it (LOCK_TIME_NOT_REACHED: nothing sent or recorded). Absent: lock time 0, the plan as before.
Not on the simulator nor for `amount: "all"` (LOCK_TIME_NOT_SUPPORTED).

###### maxFeeSompi?

`string` \| `number` \| `bigint`

TX-FEE-GUARD-1: the most this transaction may pay in total, in sompi. Refused with FEE_EXCEEDS_MAX when the
planned fee is above it (or above the workspace's `networks[<net>].maxFeeSompi`, the lower one applies); recorded
in the plan and enforced again at sign and send. Optional: without it (and without a network limit) HardKAS's
default limit applies (`DEFAULT_MAX_FEE_SOMPI`, 10,000,000 sompi = 0.1 KAS; TX-05).

###### networkProfile?

`string`

###### outputs?

readonly [`TxPlanRecipient`](../interfaces/TxPlanRecipient.md)[]

R4-T · several recipients paid by ONE transaction: one payment output per entry, in this order, then one change
output and one fee — the alternative to `to` + `amount` (exactly one of the two forms: TX_PLAN_RECIPIENTS_CONFLICT;
a malformed list, a non-positive amount or "all": TX_PLAN_RECIPIENTS_INVALID). Each `amount` has the units of
`amount`. One entry plans exactly what `to` + `amount` plans (the same plan, byte for byte). The plan records every
output in `outputs`; its `to` and `amountSompi` name the FIRST recipient. Every guard of a payment applies (fee
limit, fee rate bound, lock time, mainnet, covenant UTXOs never spent, CHANGE_BELOW_STANDARD_OUTPUT), and more
recipients than fit in one standard transaction are refused before anything is signed (TOO_MANY_OUTPUTS, which
names how many fit). `tx.sign` and `tx.send` check every output against the plan (SIGNED_PLAN_MISMATCH).

###### policy?

`string`

###### to?

`string` \| `HardkasAccount`

The recipient (one-recipient form). Required unless `outputs` is given; never together with it.

###### workflowId?

`string`

#### Returns

`Promise`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

***

### send()

> **send**(`signedArtifact`, `urlOrOptions?`): `Promise`\<\{ `alreadySubmitted?`: `boolean`; `artifactId?`: `string`; `derived?`: `DerivedTxStatus`; `mode?`: `string`; `nodeCheck?`: `SendNodeCheck`; `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md) \| `TxSubmissionArtifact`; `receiptPath?`: `string`; `rejection?`: `NodeRejection`; `simulated?`: `boolean`; `submission?`: `TxSubmissionArtifact`; `submitted?`: `boolean`; `txId?`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:2306](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L2306)

Sends a signed transaction to the real RPC network.

#### Parameters

##### signedArtifact

[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)

##### urlOrOptions?

`string` \| [`SendTxOptions`](../interfaces/SendTxOptions.md)

#### Returns

`Promise`\<\{ `alreadySubmitted?`: `boolean`; `artifactId?`: `string`; `derived?`: `DerivedTxStatus`; `mode?`: `string`; `nodeCheck?`: `SendNodeCheck`; `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md) \| `TxSubmissionArtifact`; `receiptPath?`: `string`; `rejection?`: `NodeRejection`; `simulated?`: `boolean`; `submission?`: `TxSubmissionArtifact`; `submitted?`: `boolean`; `txId?`: `string`; \}\>

***

### sign()

#### Call Signature

> **sign**(`plan`, `options?`): `Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:1365](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L1365)

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

Defined in: [packages/sdk/src/tx.ts:1373](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L1373)

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

> **simulate**(`target`, `options?`): `Promise`\<\{ `alreadyApplied?`: `true`; `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md); `receiptPath?`: `string`; `tracePath?`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:2027](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L2027)

#### Parameters

##### target

`string` \| [`SignedTxArtifact`](../interfaces/SignedTxArtifact.md) \| `Partial`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

##### options?

###### persist?

`boolean`

###### plan?

[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)

#### Returns

`Promise`\<\{ `alreadyApplied?`: `true`; `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md); `receiptPath?`: `string`; `tracePath?`: `string`; \}\>

***

### status()

> **status**(`txId`, `policy?`): `Promise`\<`DerivedTxStatus`\>

Defined in: [packages/sdk/src/tx.ts:3394](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L3394)

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

Defined in: [packages/sdk/src/tx.ts:713](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L713)

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

Defined in: [packages/sdk/src/tx.ts:748](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L748)

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
