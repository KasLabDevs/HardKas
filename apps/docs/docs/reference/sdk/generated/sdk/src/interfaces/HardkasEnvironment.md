[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasEnvironment

# Interface: HardkasEnvironment

Defined in: [packages/sdk/src/environment.ts:16](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L16)

## Properties

### accounts

> **accounts**: `object`

Defined in: [packages/sdk/src/environment.ts:30](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L30)

Accounts API: list, resolve, balance, fund (localnet), etc.

#### list

> **list**: () => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`[]\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`[]\>\>

***

### addressManager

> **addressManager**: `object`

Defined in: [packages/sdk/src/environment.ts:87](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L87)

Address Manager API

#### derive

> **derive**: `any`

#### deriveChange

> **deriveChange**: `any`

#### deriveReceive

> **deriveReceive**: `any`

#### path

> **path**: `any`

***

### artifacts

> **artifacts**: `object`

Defined in: [packages/sdk/src/environment.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L39)

Artifacts API: explain, replay, watch

#### explain

> **explain**: (`id`) => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### id

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### replay

> **replay**: (`id`) => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### id

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### watch

> **watch**: (`callback`, `options?`) => () => `void`

##### Parameters

###### callback

(`artifact`) => `void`

###### options?

###### intervalMs?

`number`

###### lineage?

`boolean`

###### replay?

`boolean`

###### transport?

`"sse"` \| `"poll"`

###### type?

`string`

##### Returns

() => `void`

***

### coinSelector

> **coinSelector**: `object`

Defined in: [packages/sdk/src/environment.ts:63](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L63)

Coin Selector API.

- `select`: DEPRECATED — HardKAS-invented largest/smallest-first selector.
  Diverges from upstream in fragmented-UTXO scenarios (M9 audit).
  Kept for backwards compatibility; will be removed in a future release.
- `buildTransactions`: recommended path — wraps kaspa-wasm 2.0.1 `Generator`
  and yields upstream `PendingTransaction`s (authoritative fee/mass/coin
  selection semantics).

#### buildTransactions

> **buildTransactions**: (`input`) => `AsyncGenerator`\<`any`\>

Iterates the WASM `Generator` and yields each `PendingTransaction`.
Consumer is responsible for signing (`pt.sign([keys])` or `pt.signInput(...)`)
and submission (`pt.submit(rpc)`).

##### Parameters

###### input

`GeneratorSettingsInput`

##### Returns

`AsyncGenerator`\<`any`\>

#### estimateTransactions

> **estimateTransactions**: (`input`) => `Promise`\<`any`\>

`Generator.estimate()` — no invented conservative padding. Returns the
upstream `GeneratorSummary` (fees, mass, utxos, transactions count, ids).

##### Parameters

###### input

`GeneratorSettingsInput`

##### Returns

`Promise`\<`any`\>

#### ~~select~~

> **select**: (`request`) => `CoinSelectionResult`

##### Parameters

###### request

`CoinSelectionRequest`

##### Returns

`CoinSelectionResult`

##### Deprecated

Since M10-B. `selectCoins` is a HardKAS-invented largest-first
selector that diverges from the upstream `Generator` in `kaspa-wasm` 2.0.1
(M9 audit: PUBLIC RELEASE + TESTNET blocker). Use
buildTransactions from `kaspa-wallet-adapter.ts` instead, which
yields upstream `PendingTransaction`s with authoritative fee/mass/coin
selection semantics.

This function will continue to work through M10 for backward compatibility
but SHOULD NOT be used in new code. It is expected to be deleted once every
consumer migrates.

##### Deprecated

Use coinSelector.buildTransactions instead (M10-B).

***

### config

> **config**: `HardkasConfig`

Defined in: [packages/sdk/src/environment.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L18)

The currently loaded HardKAS configuration.

***

### confirmationPolicy

> **confirmationPolicy**: `object`

Defined in: [packages/sdk/src/environment.ts:111](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L111)

Confirmation Policy API

#### getRequired

> **getRequired**: (`request`) => `ConfirmationPolicyResult`

##### Parameters

###### request

`ConfirmationPolicyRequest`

##### Returns

`ConfirmationPolicyResult`

***

### expect

> **expect**: `any`

Defined in: [packages/sdk/src/environment.ts:51](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L51)

The vitest `expect` function. 
Available for convenience inside scenarios (e.g. `hk.expect(a).toBe(b)`).

***

### feeEstimator

> **feeEstimator**: `object`

Defined in: [packages/sdk/src/environment.ts:80](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L80)

Fee Estimator API.

- `estimate`: DEPRECATED — HardKAS `+10%` conservative padding on top of a
  hardcoded `100n` sompi/gram default. Wrong for any real network (M9).
- `estimateTransactions`: recommended path — upstream `Generator.estimate()`
  with authoritative fee/mass, no invented padding.
- `rpcFeeEstimate`: node's live fee estimate via wasm RpcClient. Prefer this
  over any HardKAS-side default when a wasm RPC is available.

#### ~~estimate~~

> **estimate**: (`request`) => `FeeEstimationResult`

##### Parameters

###### request

`FeeEstimationRequest`

##### Returns

`FeeEstimationResult`

##### Deprecated

Since M10-C. `estimateFee` implements a HardKAS "conservative"
`+10%` heuristic over the pinned SDK mass, on top of a hardcoded
`DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS = 100n`. Upstream
`Generator.estimate()` (via `estimateTransactionsUpstream` in
`kaspa-wallet-adapter.ts`) is exact — no +10% padding, and it reads the
network params from the SDK. Use that for anything you plan to submit.

This function will continue to work through M10 for backward compatibility
but SHOULD NOT be used in new code.

##### Deprecated

Use feeEstimator.estimateTransactions instead (M10-C).

#### estimateTransactions

> **estimateTransactions**: (`input`) => `Promise`\<`any`\>

`Generator.estimate()` — no invented conservative padding. Returns the
upstream `GeneratorSummary` (fees, mass, utxos, transactions count, ids).

##### Parameters

###### input

`GeneratorSettingsInput`

##### Returns

`Promise`\<`any`\>

***

### kaspaUri

> **kaspaUri**: `object`

Defined in: [packages/sdk/src/environment.ts:106](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L106)

Kaspa URI API

#### build

> **build**: `any`

***

### localnet

> **localnet**: `object`

Defined in: [packages/sdk/src/environment.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L33)

Localnet API: status, start, stop, etc.

#### status

> **status**: () => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

***

### mode

> **mode**: [`HardkasMode`](../type-aliases/HardkasMode.md)

Defined in: [packages/sdk/src/environment.ts:24](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L24)

The execution mode of the environment.

***

### paymentReceipts

> **paymentReceipts**: `object`

Defined in: [packages/sdk/src/environment.ts:121](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L121)

Payment Receipts API

#### create

> **create**: `any`

***

### paymentTracker

> **paymentTracker**: `object`

Defined in: [packages/sdk/src/environment.ts:116](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L116)

Payment Tracker API

#### check

> **check**: (`request`) => `Promise`\<`PaymentCheckResult`\>

##### Parameters

###### request

`PaymentCheckRequest`

##### Returns

`Promise`\<`PaymentCheckResult`\>

***

### policy

> **policy**: `Policy`

Defined in: [packages/sdk/src/environment.ts:27](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L27)

The evaluated policy constraints for the environment.

***

### query

> **query**: `any`

Defined in: [packages/sdk/src/environment.ts:42](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L42)

Query API for querying the read model (stubbed from client if missing, or added)

***

### replay

> **replay**: `object`

Defined in: [packages/sdk/src/environment.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L45)

Replay / Session API

#### diffReplay

> **diffReplay**: (`artifactId`) => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### artifactId

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### export

> **export**: () => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### import

> **import**: (`data`, `force?`) => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### data

`any`

###### force?

`boolean`

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### replay

> **replay**: (`options?`) => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### options?

###### strict?

`boolean`

###### untilArtifact?

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### snapshot

> **snapshot**: () => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### start

> **start**: () => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### timeTravel

> **timeTravel**: (`artifactId`) => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### artifactId

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

***

### tx

> **tx**: `object`

Defined in: [packages/sdk/src/environment.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L36)

Transaction API: plan, sign, send, receipt

#### plan

> **plan**: (`params`) => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### params

###### amountSompi

`string`

###### feeRate?

`string`

###### from

`string`

###### to

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### receipt

> **receipt**: (`id`) => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### id

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### send

> **send**: (`params`) => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### params

###### allowDevAutoSign?

`boolean`

###### amountSompi?

`string`

###### feeRate?

`string`

###### from?

`string`

###### signedTxId?

`string`

###### to?

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

#### sign

> **sign**: (`params`) => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### params

###### account

`string`

###### planId

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

***

### walletManager

> **walletManager**: `object`

Defined in: [packages/sdk/src/environment.ts:95](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L95)

Wallet Manager API

#### create

> **create**: `any`

#### exportMetadata

> **exportMetadata**: `any`

#### getSeedRef

> **getSeedRef**: `any`

#### importMnemonic

> **importMnemonic**: `any`

***

### walletQuery

> **walletQuery**: `WalletQuery`

Defined in: [packages/sdk/src/environment.ts:103](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L103)

Wallet Query API

***

### workspaceRoot

> **workspaceRoot**: `string`

Defined in: [packages/sdk/src/environment.ts:21](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/environment.ts#L21)

The root directory of the workspace where the config was found.
