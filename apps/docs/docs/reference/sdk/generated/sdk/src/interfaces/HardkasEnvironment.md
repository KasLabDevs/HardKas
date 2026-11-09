[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasEnvironment

# Interface: HardkasEnvironment

Defined in: [packages/sdk/src/environment.ts:16](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L16)

## Properties

### accounts

> **accounts**: `object`

Defined in: [packages/sdk/src/environment.ts:30](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L30)

Accounts API: list, resolve, balance, fund (localnet), etc.

#### list

> **list**: () => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`[]\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`[]\>\>

***

### addressManager

> **addressManager**: `object`

Defined in: [packages/sdk/src/environment.ts:77](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L77)

Address Manager API — WALLET-HD-0: the SYNTHETIC derivation (keys computable from seedRef + path + network), not
BIP32; simnet only, every other network is refused (SYNTHETIC_DERIVATION_NETWORK_BLOCKED).

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

Defined in: [packages/sdk/src/environment.ts:39](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L39)

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

Defined in: [packages/sdk/src/environment.ts:60](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L60)

Coin Selector API: the pinned kaspa-wasm `Generator`.

- `buildTransactions`: yields upstream `PendingTransaction`s (authoritative
  fee/mass/coin selection semantics).
- `estimateTransactions`: upstream `Generator.estimate()`.

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

***

### config

> **config**: `HardkasConfig`

Defined in: [packages/sdk/src/environment.ts:18](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L18)

The currently loaded HardKAS configuration.

***

### confirmationPolicy

> **confirmationPolicy**: `object`

Defined in: [packages/sdk/src/environment.ts:104](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L104)

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

Defined in: [packages/sdk/src/environment.ts:51](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L51)

The vitest `expect` function. 
Available for convenience inside scenarios (e.g. `hk.expect(a).toBe(b)`).

***

### feeEstimator

> **feeEstimator**: `object`

Defined in: [packages/sdk/src/environment.ts:69](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L69)

Fee Estimator API: upstream `Generator.estimate()` with authoritative
fee/mass, no invented padding.

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

Defined in: [packages/sdk/src/environment.ts:99](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L99)

Kaspa URI API

#### build

> **build**: `any`

***

### localnet

> **localnet**: `object`

Defined in: [packages/sdk/src/environment.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L33)

Localnet API: status, start, stop, etc.

#### status

> **status**: () => `Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](ClientEnvelope.md)\<`any`\>\>

***

### mode

> **mode**: [`HardkasMode`](../type-aliases/HardkasMode.md)

Defined in: [packages/sdk/src/environment.ts:24](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L24)

The execution mode of the environment.

***

### paymentReceipts

> **paymentReceipts**: `object`

Defined in: [packages/sdk/src/environment.ts:114](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L114)

Payment Receipts API

#### create

> **create**: `any`

***

### paymentTracker

> **paymentTracker**: `object`

Defined in: [packages/sdk/src/environment.ts:109](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L109)

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

Defined in: [packages/sdk/src/environment.ts:27](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L27)

The evaluated policy constraints for the environment.

***

### query

> **query**: `any`

Defined in: [packages/sdk/src/environment.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L42)

Query API for querying the read model (stubbed from client if missing, or added)

***

### replay

> **replay**: `object`

Defined in: [packages/sdk/src/environment.ts:45](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L45)

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

Defined in: [packages/sdk/src/environment.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L36)

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

###### allowNewPaymentAfterUnknown?

`boolean`

###### amountSompi?

`string`

###### feeRate?

`string`

###### from?

`string`

###### idempotencyKey?

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

Defined in: [packages/sdk/src/environment.ts:88](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L88)

Wallet Manager API — WALLET-HD-0: synthetic wallets whose keys derive from the PUBLIC walletId; simnet only.
`importMnemonic` hashes the given text: it is NOT BIP39 recovery of any Kaspa wallet.

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

Defined in: [packages/sdk/src/environment.ts:96](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L96)

Wallet Query API

***

### workspaceRoot

> **workspaceRoot**: `string`

Defined in: [packages/sdk/src/environment.ts:21](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/environment.ts#L21)

The root directory of the workspace where the config was found.
