[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasAccounts

# Class: HardkasAccounts

Defined in: [packages/sdk/src/accounts.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L9)

**`Alpha`**

HardKAS Accounts Module

## Constructors

### Constructor

> **new HardkasAccounts**(`sdk`): `HardkasAccounts`

Defined in: [packages/sdk/src/accounts.ts:10](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L10)

**`Alpha`**

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasAccounts`

## Methods

### balance()

> **balance**(`accountNameOrAddress`): `Promise`\<\{ `formatted`: `string`; `sompi`: `bigint`; \}\>

Defined in: [packages/sdk/src/accounts.ts:48](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L48)

**`Alpha`**

Alias for getBalance.

#### Parameters

##### accountNameOrAddress

`string`

#### Returns

`Promise`\<\{ `formatted`: `string`; `sompi`: `bigint`; \}\>

***

### createDevSigner()

> **createDevSigner**(`accountNameOrAddress`): `Promise`\<`HardkasTxPlanSigner`\>

Defined in: [packages/sdk/src/accounts.ts:117](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L117)

**`Alpha`**

Creates an explicit local dev signer for WalletToolkit.
Do not use for production custody.

#### Parameters

##### accountNameOrAddress

`string`

#### Returns

`Promise`\<`HardkasTxPlanSigner`\>

***

### derive()

> **derive**(`name`): `Promise`\<`HardkasAccount`\>

Defined in: [packages/sdk/src/accounts.ts:55](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L55)

**`Alpha`**

Derives a new random account on the fly.

#### Parameters

##### name

`string`

#### Returns

`Promise`\<`HardkasAccount`\>

***

### fund()

> **fund**(`accountNameOrAddress`, `options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/accounts.ts:71](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L71)

**`Alpha`**

Funds an account from another account (defaults to 'default' account).

#### Parameters

##### accountNameOrAddress

`string`

##### options?

###### amount?

`string` \| `bigint`

###### from?

`string`

#### Returns

`Promise`\<`any`\>

***

### getBalance()

> **getBalance**(`accountNameOrAddress`): `Promise`\<\{ `formatted`: `string`; `sompi`: `bigint`; \}\>

Defined in: [packages/sdk/src/accounts.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L29)

**`Alpha`**

Fetches the balance for an account.

#### Parameters

##### accountNameOrAddress

`string`

#### Returns

`Promise`\<\{ `formatted`: `string`; `sompi`: `bigint`; \}\>

***

### list()

> **list**(): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [packages/sdk/src/accounts.ts:62](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L62)

**`Alpha`**

Lists available accounts in the current context.

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

***

### privateKeyAuthorizer()

> **privateKeyAuthorizer**(`accountName`): `LazyAccountAuthorizer`

Defined in: [packages/sdk/src/accounts.ts:125](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L125)

**`Alpha`**

Creates an authorizer that lazily resolves an account's private key for signing.

#### Parameters

##### accountName

`string`

#### Returns

`LazyAccountAuthorizer`

***

### resolve()

> **resolve**(`nameOrAddress`, `executionTarget?`): `Promise`\<`HardkasAccount`\>

Defined in: [packages/sdk/src/accounts.ts:15](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L15)

**`Alpha`**

Resolves an account by name or address.

#### Parameters

##### nameOrAddress

`string`

##### executionTarget?

###### domain

`"kaspa-l1"` \| `"evm-l2"`

###### mode

`"rpc"` \| `"simulator"` \| `"localnet"`

###### network

`string`

#### Returns

`Promise`\<`HardkasAccount`\>

***

### staticSignatureScriptAuthorizer()

> **staticSignatureScriptAuthorizer**(`signatureScript`): [`StaticSignatureScriptAuthorizer`](StaticSignatureScriptAuthorizer.md)

Defined in: [packages/sdk/src/accounts.ts:132](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/accounts.ts#L132)

**`Alpha`**

Creates an authorizer that injects a static signature script into an input.

#### Parameters

##### signatureScript

`string`

#### Returns

[`StaticSignatureScriptAuthorizer`](StaticSignatureScriptAuthorizer.md)
