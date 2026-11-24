[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasKcc20

# Class: HardkasKcc20

Defined in: [packages/sdk/src/kcc20.ts:302](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L302)

HardKAS KCC-20 · deploy, transfer and read KCC-20 tokens on a node with the SDK's v1 engine. Mainnet is refused before
any key is read or any node contacted (MAINNET_SIGNING_DISABLED for deploy and transfer, MAINNET_CONNECTION_DISABLED for
the reads); a public testnet needs the payments' opt-in, as every SDK transaction does.

## Constructors

### Constructor

> **new HardkasKcc20**(`sdk`): `HardkasKcc20`

Defined in: [packages/sdk/src/kcc20.ts:303](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L303)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasKcc20`

## Methods

### balance()

> **balance**(`covenantId`, `holder`, `options?`): `Promise`\<[`Kcc20Balance`](../interfaces/Kcc20Balance.md)\>

Defined in: [packages/sdk/src/kcc20.ts:559](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L559)

A holder's balance: its live outputs (owned by its key, 0x00, or by its key's hash, 0x01) and their sum.

#### Parameters

##### covenantId

`string`

##### holder

`string`

##### options?

`Pick`\<`CovenantSignOptions`, `"facts"` \| `"compileRecords"`\> = `{}`

#### Returns

`Promise`\<[`Kcc20Balance`](../interfaces/Kcc20Balance.md)\>

***

### deploy()

> **deploy**(`options`, `sign?`): `Promise`\<\{ `covenantId`: `string`; `plan`: `any`; `sent`: `any`; `signed`: `any`; `states`: readonly `Kcc20State`[]; `txId`: `string`; \}\>

Defined in: [packages/sdk/src/kcc20.ts:341](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L341)

Deploys a token: planDeploy, then the engine signs and sends it. The covenant id is the one the genesis binds.

#### Parameters

##### options

[`Kcc20DeployOptions`](../interfaces/Kcc20DeployOptions.md)

##### sign?

[`Kcc20SignOptions`](../interfaces/Kcc20SignOptions.md) & [`SendTxOptions`](../interfaces/SendTxOptions.md) = `{}`

#### Returns

`Promise`\<\{ `covenantId`: `string`; `plan`: `any`; `sent`: `any`; `signed`: `any`; `states`: readonly `Kcc20State`[]; `txId`: `string`; \}\>

***

### facts()

> **facts**(`config?`, `sign?`): `V1EngineFacts`

Defined in: [packages/sdk/src/kcc20.ts:306](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L306)

The engine's facts for KCC-20 programs (kcc20ProgramFacts over this workspace's reproduced compile records).

#### Parameters

##### config?

`Kcc20Config` = `KCC20_DEFAULT_CONFIG`

##### sign?

`Pick`\<`CovenantSignOptions`, `"facts"` \| `"compileRecords"`\> = `{}`

#### Returns

`V1EngineFacts`

***

### holdings()

> **holdings**(`covenantId`, `options?`): `Promise`\<[`Kcc20Holdings`](../interfaces/Kcc20Holdings.md)\>

Defined in: [packages/sdk/src/kcc20.ts:553](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L553)

The live token outputs of a covenant (this workspace's records, each listed unspent at the node, its state verified).

#### Parameters

##### covenantId

`string`

##### options?

`Pick`\<`CovenantSignOptions`, `"facts"` \| `"compileRecords"`\> = `{}`

#### Returns

`Promise`\<[`Kcc20Holdings`](../interfaces/Kcc20Holdings.md)\>

***

### planDeploy()

> **planDeploy**(`options`, `sign?`): `Promise`\<\{ `plan`: `any`; `program`: [`Kcc20Program`](../interfaces/Kcc20Program.md); `states`: readonly `Kcc20State`[]; \}\>

Defined in: [packages/sdk/src/kcc20.ts:313](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L313)

Plans a token genesis: one output per holder (the program holding its KCC20State), all one covenant id.

#### Parameters

##### options

[`Kcc20DeployOptions`](../interfaces/Kcc20DeployOptions.md)

##### sign?

[`Kcc20SignOptions`](../interfaces/Kcc20SignOptions.md) = `{}`

#### Returns

`Promise`\<\{ `plan`: `any`; `program`: [`Kcc20Program`](../interfaces/Kcc20Program.md); `states`: readonly `Kcc20State`[]; \}\>

***

### planTransfer()

> **planTransfer**(`options`, `sign?`): `Promise`\<[`Kcc20PlannedTransfer`](../interfaces/Kcc20PlannedTransfer.md)\>

Defined in: [packages/sdk/src/kcc20.ts:355](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L355)

Plans a transfer: the token inputs (`from`'s outputs, or the ones named), the recipients and the change, checked
against the KCC-20 rules before any key is read; the owners' signatures (SIGHASH_ALL over the engine's own
transaction) in the witnesses; the plan the engine's, checked again with the signatures. The fee inputs, if a funder
pays, are signed by `sign`.

#### Parameters

##### options

[`Kcc20TransferOptions`](../interfaces/Kcc20TransferOptions.md)

##### sign?

[`Kcc20SignOptions`](../interfaces/Kcc20SignOptions.md) = `{}`

#### Returns

`Promise`\<[`Kcc20PlannedTransfer`](../interfaces/Kcc20PlannedTransfer.md)\>

***

### send()

> **send**(`signed`, `options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/kcc20.ts:547](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L547)

Sends a signed KCC-20 transaction: sdk.covenants.send (sdk.tx.send) with the KCC-20 facts.

#### Parameters

##### signed

`any`

##### options?

[`Kcc20SignOptions`](../interfaces/Kcc20SignOptions.md) & [`SendTxOptions`](../interfaces/SendTxOptions.md) = `{}`

#### Returns

`Promise`\<`any`\>

***

### sign()

> **sign**(`plan`, `sign?`): `Promise`\<\{ `feeSompi`: `bigint`; `mass`: `any`; `signed`: `any`; `txId`: `string`; `warnings`: readonly `string`[]; \}\>

Defined in: [packages/sdk/src/kcc20.ts:541](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L541)

The engine signs a KCC-20 plan (F1.4 with the KCC-20 facts first; the token inputs carry their owners' signatures already).

#### Parameters

##### plan

`any`

##### sign?

[`Kcc20SignOptions`](../interfaces/Kcc20SignOptions.md) = `{}`

#### Returns

`Promise`\<\{ `feeSompi`: `bigint`; `mass`: `any`; `signed`: `any`; `txId`: `string`; `warnings`: readonly `string`[]; \}\>

***

### transfer()

> **transfer**(`options`, `sign?`): `Promise`\<[`Kcc20PlannedTransfer`](../interfaces/Kcc20PlannedTransfer.md) & `object`\>

Defined in: [packages/sdk/src/kcc20.ts:533](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L533)

Transfers tokens: planTransfer, then the engine signs (the fee inputs) and sends it.

#### Parameters

##### options

[`Kcc20TransferOptions`](../interfaces/Kcc20TransferOptions.md)

##### sign?

[`Kcc20SignOptions`](../interfaces/Kcc20SignOptions.md) & [`SendTxOptions`](../interfaces/SendTxOptions.md) = `{}`

#### Returns

`Promise`\<[`Kcc20PlannedTransfer`](../interfaces/Kcc20PlannedTransfer.md) & `object`\>
