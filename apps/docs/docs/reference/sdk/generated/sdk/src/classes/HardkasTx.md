[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasTx

# Class: HardkasTx

Defined in: [packages/sdk/src/tx.ts:108](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L108)

## Constructors

### Constructor

> **new HardkasTx**(`sdk`): `HardkasTx`

Defined in: [packages/sdk/src/tx.ts:109](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L109)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasTx`

## Methods

### appendSignature()

> **appendSignature**(`plan`, `account?`): `Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:1550](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L1550)

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

Defined in: [packages/sdk/src/tx.ts:530](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L530)

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

###### network?

`string`

###### selectedUtxos

`any`[]

###### totalUtxosSeen?

`number`

#### Returns

`Promise`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

***

### plan()

> **plan**(`options`): `Promise`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:239](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L239)

Plans a transaction.

#### Parameters

##### options

###### amount

`string` \| `number` \| `bigint`

###### assumption?

`string`

###### feeRate?

`bigint`

###### from

`string` \| `HardkasAccount`

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

> **send**(`signedArtifact`, `urlOrOptions?`): `Promise`\<\{ `artifactId?`: `string`; `mode?`: `string`; `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md); `receiptPath?`: `string`; `simulated?`: `boolean`; `submitted?`: `boolean`; `txId?`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:1338](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L1338)

Sends a signed transaction to the real RPC network.

#### Parameters

##### signedArtifact

[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)

##### urlOrOptions?

`string` \| \{ `persist?`: `boolean`; \}

#### Returns

`Promise`\<\{ `artifactId?`: `string`; `mode?`: `string`; `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md); `receiptPath?`: `string`; `simulated?`: `boolean`; `submitted?`: `boolean`; `txId?`: `string`; \}\>

***

### sign()

#### Call Signature

> **sign**(`plan`, `options?`): `Promise`\<[`SignedTxArtifact`](../interfaces/SignedTxArtifact.md)\>

Defined in: [packages/sdk/src/tx.ts:631](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L631)

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

Defined in: [packages/sdk/src/tx.ts:639](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L639)

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

Defined in: [packages/sdk/src/tx.ts:1054](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L1054)

Simulates a transaction on the local state without broadcasting to a real Kaspa node.
Modifies the local deterministic state and outputs receipt/trace artifacts.

#### Parameters

##### target

`string` \| [`SignedTxArtifact`](../interfaces/SignedTxArtifact.md) \| `Partial`\<[`TxPlanArtifact`](../interfaces/TxPlanArtifact.md)\>

##### options?

###### persist?

`boolean`

#### Returns

`Promise`\<\{ `receipt`: [`TxReceiptArtifact`](../interfaces/TxReceiptArtifact.md); `receiptPath?`: `string`; `tracePath?`: `string`; \}\>

***

### status()

> **status**(`txId`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/tx.ts:1560](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L1560)

Fetches the current status of a transaction by ID.

#### Parameters

##### txId

`string`

#### Returns

`Promise`\<`any`\>

***

### waitForAccepted()

> **waitForAccepted**(`options`): `Promise`\<\{ `acceptingBlockHash`: `any`; `status`: `string`; `txId`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:114](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L114)

Waits for a transaction to be accepted into the DAG.

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

`Promise`\<\{ `acceptingBlockHash`: `any`; `status`: `string`; `txId`: `string`; \}\>

***

### waitForConfirmations()

> **waitForConfirmations**(`options`): `Promise`\<\{ `acceptingBlockHash`: `string`; `confirmations`: `number`; `observedAtDaaScore`: `string`; `status`: `string`; \}\>

Defined in: [packages/sdk/src/tx.ts:177](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/tx.ts#L177)

Waits for a transaction to reach a minimum number of confirmations.

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

`Promise`\<\{ `acceptingBlockHash`: `string`; `confirmations`: `number`; `observedAtDaaScore`: `string`; `status`: `string`; \}\>
