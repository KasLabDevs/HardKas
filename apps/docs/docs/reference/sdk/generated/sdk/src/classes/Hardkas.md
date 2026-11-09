[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Hardkas

# Class: Hardkas

Defined in: [packages/sdk/src/index.ts:310](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L310)

HardKAS SDK - Main Entry Point

Provides a high-level facade for interacting with the Kaspa ecosystem.
Acts as a DI container and coordinator.

## Properties

### accounts

> `readonly` **accounts**: [`HardkasAccounts`](HardkasAccounts.md)

Defined in: [packages/sdk/src/index.ts:314](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L314)

***

### artifacts

> `readonly` **artifacts**: [`HardkasArtifactsManager`](HardkasArtifactsManager.md)

Defined in: [packages/sdk/src/index.ts:313](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L313)

***

### capabilities

> `readonly` **capabilities**: [`HardkasCapabilitiesApi`](HardkasCapabilitiesApi.md)

Defined in: [packages/sdk/src/index.ts:324](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L324)

***

### config

> `readonly` **config**: `LoadedHardkasConfig`

Defined in: [packages/sdk/src/index.ts:397](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L397)

***

### covenants

> `readonly` **covenants**: [`HardkasCovenants`](HardkasCovenants.md)

Defined in: [packages/sdk/src/index.ts:322](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L322)

***

### execution

> `readonly` **execution**: `object`

Defined in: [packages/sdk/src/index.ts:384](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L384)

WORKSPACE-AUTHORITY-2 (WA2-I1): the execution target this instance runs on — resolved once, at open, by the
resolver the CLI uses too (`resolveWorkspaceExecution`, @hardkas/config): the `target` option, else the `network`
option, else the workspace's `execution` contract (else its legacy `defaultNetwork`). Every reader of "which world"
in the SDK follows it: `network`, the provider, the accounts, the plans, the workflows, the observers.

#### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

#### network

> **network**: `string`

***

### executionSource

> `readonly` **executionSource**: `WorkspaceExecutionSource`

Defined in: [packages/sdk/src/index.ts:386](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L386)

What decided `execution`: "target", "network", "execution" or "defaultNetwork".

***

### experimental

> `readonly` **experimental**: [`HardkasExperimental`](HardkasExperimental.md)

Defined in: [packages/sdk/src/index.ts:320](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L320)

***

### fees

> `readonly` **fees**: [`HardkasFees`](HardkasFees.md)

Defined in: [packages/sdk/src/index.ts:321](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L321)

***

### l2

> `readonly` **l2**: [`HardkasL2`](HardkasL2.md)

Defined in: [packages/sdk/src/index.ts:323](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L323)

***

### lineage

> `readonly` **lineage**: [`HardkasLineage`](HardkasLineage.md)

Defined in: [packages/sdk/src/index.ts:318](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L318)

***

### localnet

> `readonly` **localnet**: [`HardkasLocalnet`](HardkasLocalnet.md)

Defined in: [packages/sdk/src/index.ts:317](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L317)

***

### mode

> `readonly` **mode**: `"developer"` \| `"agent"`

Defined in: [packages/sdk/src/index.ts:373](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L373)

***

### node

> `readonly` **node**: `HardkasNodeApi`

Defined in: [packages/sdk/src/index.ts:312](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L312)

***

### observe

> `readonly` **observe**: `HardkasObserve`

Defined in: [packages/sdk/src/index.ts:327](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L327)

***

### plugins

> `readonly` **plugins**: `HardkasPluginManager`

Defined in: [packages/sdk/src/index.ts:319](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L319)

***

### policy

> `readonly` **policy**: `Required`\<`NonNullable`\<[`HardkasOptions`](../interfaces/HardkasOptions.md)\[`"policy"`\]\>\>

Defined in: [packages/sdk/src/index.ts:374](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L374)

***

### query

> `readonly` **query**: [`HardkasQuery`](HardkasQuery.md)

Defined in: [packages/sdk/src/index.ts:328](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L328)

***

### replay

> `readonly` **replay**: [`HardkasReplay`](HardkasReplay.md)

Defined in: [packages/sdk/src/index.ts:325](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L325)

***

### rpc

> `readonly` **rpc**: `KaspaRpcClient`

Defined in: [packages/sdk/src/index.ts:376](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L376)

***

### signer?

> `readonly` `optional` **signer?**: `ExternalHardkasSigner`

Defined in: [packages/sdk/src/index.ts:371](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L371)

***

### tx

> `readonly` **tx**: [`HardkasTx`](HardkasTx.md)

Defined in: [packages/sdk/src/index.ts:315](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L315)

***

### utxos

> `readonly` **utxos**: `HardkasUtxos`

Defined in: [packages/sdk/src/index.ts:316](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L316)

***

### wallet

> `readonly` **wallet**: `object`

Defined in: [packages/sdk/src/index.ts:330](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L330)

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

Defined in: [packages/sdk/src/index.ts:326](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L326)

***

### workspace

> `readonly` **workspace**: [`HardkasWorkspace`](HardkasWorkspace.md)

Defined in: [packages/sdk/src/index.ts:311](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L311)

## Accessors

### cwd

#### Get Signature

> **get** **cwd**(): `string`

Defined in: [packages/sdk/src/index.ts:598](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L598)

##### Returns

`string`

***

### network

#### Get Signature

> **get** **network**(): [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: [packages/sdk/src/index.ts:590](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L590)

The network this instance runs on: the network of its resolved execution target (WORKSPACE-AUTHORITY-2), not a
reading of the legacy `defaultNetwork` key.

##### Returns

[`NetworkId`](../type-aliases/NetworkId.md)

***

### sdkConfig

#### Get Signature

> **get** **sdkConfig**(): `HardkasConfig`

Defined in: [packages/sdk/src/index.ts:594](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L594)

##### Returns

`HardkasConfig`

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [packages/sdk/src/index.ts:569](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L569)

Releases what this instance created (its own RPC client), so a process that is done with the SDK can end by
itself. Never a client it was given, or one assigned to `rpc` afterwards: that one is its caller's. Idempotent; it
never throws, so it fits a `finally`. A later call that needs the node opens a new connection, which a later
close() releases.

#### Returns

`Promise`\<`void`\>

***

### enforcePolicy()

> **enforcePolicy**(`action`, `context?`): `void`

Defined in: [packages/sdk/src/index.ts:606](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L606)

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

Defined in: [packages/sdk/src/index.ts:582](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L582)

Alias for open(). Used in most examples.

#### Parameters

##### dirOrOptions?

`string` \| [`HardkasOptions`](../interfaces/HardkasOptions.md)

#### Returns

`Promise`\<`Hardkas`\>

***

### open()

> `static` **open**(`dirOrOptions?`): `Promise`\<`Hardkas`\>

Defined in: [packages/sdk/src/index.ts:475](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L475)

Opens a HardKAS project in the given directory.

#### Parameters

##### dirOrOptions?

`string` \| [`HardkasOptions`](../interfaces/HardkasOptions.md)

#### Returns

`Promise`\<`Hardkas`\>
