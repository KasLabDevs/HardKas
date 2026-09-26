[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Hardkas

# Class: Hardkas

Defined in: [packages/sdk/src/index.ts:163](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L163)

HardKAS SDK - Main Entry Point

Provides a high-level facade for interacting with the Kaspa ecosystem.
Acts as a DI container and coordinator.

## Properties

### accounts

> `readonly` **accounts**: [`HardkasAccounts`](HardkasAccounts.md)

Defined in: [packages/sdk/src/index.ts:167](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L167)

***

### artifacts

> `readonly` **artifacts**: [`HardkasArtifactsManager`](HardkasArtifactsManager.md)

Defined in: [packages/sdk/src/index.ts:166](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L166)

***

### capabilities

> `readonly` **capabilities**: [`HardkasCapabilitiesApi`](HardkasCapabilitiesApi.md)

Defined in: [packages/sdk/src/index.ts:177](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L177)

***

### config

> `readonly` **config**: `LoadedHardkasConfig`

Defined in: [packages/sdk/src/index.ts:206](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L206)

***

### covenants

> `readonly` **covenants**: [`HardkasCovenants`](HardkasCovenants.md)

Defined in: [packages/sdk/src/index.ts:175](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L175)

***

### events

> `readonly` **events**: `ReactiveEventProvider`

Defined in: [packages/sdk/src/index.ts:182](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L182)

***

### experimental

> `readonly` **experimental**: [`HardkasExperimental`](HardkasExperimental.md)

Defined in: [packages/sdk/src/index.ts:173](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L173)

***

### fees

> `readonly` **fees**: [`HardkasFees`](HardkasFees.md)

Defined in: [packages/sdk/src/index.ts:174](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L174)

***

### l2

> `readonly` **l2**: [`HardkasL2`](HardkasL2.md)

Defined in: [packages/sdk/src/index.ts:176](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L176)

***

### lineage

> `readonly` **lineage**: [`HardkasLineage`](HardkasLineage.md)

Defined in: [packages/sdk/src/index.ts:171](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L171)

***

### localnet

> `readonly` **localnet**: [`HardkasLocalnet`](HardkasLocalnet.md)

Defined in: [packages/sdk/src/index.ts:170](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L170)

***

### mode

> `readonly` **mode**: `"developer"` \| `"agent"`

Defined in: [packages/sdk/src/index.ts:200](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L200)

***

### node

> `readonly` **node**: `HardkasNodeApi`

Defined in: [packages/sdk/src/index.ts:165](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L165)

***

### observe

> `readonly` **observe**: `HardkasObserve`

Defined in: [packages/sdk/src/index.ts:180](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L180)

***

### plugins

> `readonly` **plugins**: `HardkasPluginManager`

Defined in: [packages/sdk/src/index.ts:172](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L172)

***

### policy

> `readonly` **policy**: `Required`\<`NonNullable`\<[`HardkasOptions`](../interfaces/HardkasOptions.md)\[`"policy"`\]\>\>

Defined in: [packages/sdk/src/index.ts:201](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L201)

***

### query

> `readonly` **query**: [`HardkasQuery`](HardkasQuery.md)

Defined in: [packages/sdk/src/index.ts:181](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L181)

***

### replay

> `readonly` **replay**: [`HardkasReplay`](HardkasReplay.md)

Defined in: [packages/sdk/src/index.ts:178](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L178)

***

### rpc

> `readonly` **rpc**: `KaspaRpcClient`

Defined in: [packages/sdk/src/index.ts:203](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L203)

***

### signer?

> `readonly` `optional` **signer?**: `ExternalHardkasSigner`

Defined in: [packages/sdk/src/index.ts:198](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L198)

***

### tx

> `readonly` **tx**: [`HardkasTx`](HardkasTx.md)

Defined in: [packages/sdk/src/index.ts:168](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L168)

***

### utxos

> `readonly` **utxos**: `HardkasUtxos`

Defined in: [packages/sdk/src/index.ts:169](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L169)

***

### wallet

> `readonly` **wallet**: `object`

Defined in: [packages/sdk/src/index.ts:184](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L184)

#### open

> **open**: (`name`, `opts?`) => `WalletToolkit`

##### Parameters

###### name

`string`

###### opts?

`Omit`\<`WalletToolkitOptions`, `"rpc"` \| `"signer"`\>

##### Returns

`WalletToolkit`

***

### workflow

> `readonly` **workflow**: `HardkasWorkflow`

Defined in: [packages/sdk/src/index.ts:179](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L179)

***

### workspace

> `readonly` **workspace**: [`HardkasWorkspace`](HardkasWorkspace.md)

Defined in: [packages/sdk/src/index.ts:164](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L164)

## Accessors

### cwd

#### Get Signature

> **get** **cwd**(): `string`

Defined in: [packages/sdk/src/index.ts:354](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L354)

##### Returns

`string`

***

### network

#### Get Signature

> **get** **network**(): [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: [packages/sdk/src/index.ts:346](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L346)

Current active network name.

##### Returns

[`NetworkId`](../type-aliases/NetworkId.md)

***

### sdkConfig

#### Get Signature

> **get** **sdkConfig**(): `HardkasConfig`

Defined in: [packages/sdk/src/index.ts:350](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L350)

##### Returns

`HardkasConfig`

## Methods

### enforcePolicy()

> **enforcePolicy**(`action`, `context?`): `void`

Defined in: [packages/sdk/src/index.ts:362](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L362)

Validates an action against the active security policy.
Throws HardkasError if the policy is violated.

#### Parameters

##### action

`"network"` \| `"mainnet"` \| `"external-wallet"` \| `"mutation"`

##### context?

`string`

#### Returns

`void`

***

### create()

> `static` **create**(`dirOrOptions?`): `Promise`\<`Hardkas`\>

Defined in: [packages/sdk/src/index.ts:339](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L339)

Alias for open(). Used in most examples.

#### Parameters

##### dirOrOptions?

`string` \| [`HardkasOptions`](../interfaces/HardkasOptions.md)

#### Returns

`Promise`\<`Hardkas`\>

***

### open()

> `static` **open**(`dirOrOptions?`): `Promise`\<`Hardkas`\>

Defined in: [packages/sdk/src/index.ts:262](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L262)

Opens a HardKAS project in the given directory.

#### Parameters

##### dirOrOptions?

`string` \| [`HardkasOptions`](../interfaces/HardkasOptions.md)

#### Returns

`Promise`\<`Hardkas`\>
