[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasAccounts

# Class: HardkasAccounts

Defined in: [packages/sdk/src/accounts.ts:10](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L10)

**`Alpha`**

HardKAS Accounts Module

## Constructors

### Constructor

> **new HardkasAccounts**(`sdk`): `HardkasAccounts`

Defined in: [packages/sdk/src/accounts.ts:11](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L11)

**`Alpha`**

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasAccounts`

## Methods

### balance()

> **balance**(`accountNameOrAddress`): `Promise`\<\{ `formatted`: `string`; `sompi`: `bigint`; \}\>

Defined in: [packages/sdk/src/accounts.ts:53](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L53)

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

Defined in: [packages/sdk/src/accounts.ts:123](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L123)

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

Defined in: [packages/sdk/src/accounts.ts:60](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L60)

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

Defined in: [packages/sdk/src/accounts.ts:77](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L77)

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

Defined in: [packages/sdk/src/accounts.ts:32](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L32)

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

Defined in: [packages/sdk/src/accounts.ts:67](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L67)

**`Alpha`**

Lists available accounts in the current context.

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

***

### privateKeyAuthorizer()

> **privateKeyAuthorizer**(`accountName`): `LazyAccountAuthorizer`

Defined in: [packages/sdk/src/accounts.ts:131](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L131)

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

Defined in: [packages/sdk/src/accounts.ts:18](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L18)

**`Alpha`**

Resolves an account by name or address — for the execution target given, else for the world this SDK instance
runs on (WORKSPACE-AUTHORITY-2: the identities follow the same resolved target as the plans, never the config's
default while the instance runs elsewhere).

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

Defined in: [packages/sdk/src/accounts.ts:138](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/accounts.ts#L138)

**`Alpha`**

Creates an authorizer that injects a static signature script into an input.

#### Parameters

##### signatureScript

`string`

#### Returns

[`StaticSignatureScriptAuthorizer`](StaticSignatureScriptAuthorizer.md)
