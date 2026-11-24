[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Hardkas

# Class: Hardkas

Defined in: [packages/sdk/src/index.ts:479](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L479)

HardKAS SDK - Main Entry Point

Provides a high-level facade for interacting with the Kaspa ecosystem.
Acts as a DI container and coordinator.

## Properties

### accounts

> `readonly` **accounts**: [`HardkasAccounts`](HardkasAccounts.md)

Defined in: [packages/sdk/src/index.ts:483](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L483)

***

### artifacts

> `readonly` **artifacts**: [`HardkasArtifactsManager`](HardkasArtifactsManager.md)

Defined in: [packages/sdk/src/index.ts:482](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L482)

***

### capabilities

> `readonly` **capabilities**: [`HardkasCapabilitiesApi`](HardkasCapabilitiesApi.md)

Defined in: [packages/sdk/src/index.ts:497](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L497)

***

### config

> `readonly` **config**: `LoadedHardkasConfig`

Defined in: [packages/sdk/src/index.ts:573](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L573)

***

### covenants

> `readonly` **covenants**: [`HardkasCovenants`](HardkasCovenants.md)

Defined in: [packages/sdk/src/index.ts:491](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L491)

***

### escrow

> `readonly` **escrow**: [`HardkasEscrow`](HardkasEscrow.md)

Defined in: [packages/sdk/src/index.ts:493](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L493)

ESCROW-LIFECYCLE-1: the v2 escrow lifecycle (create, fund, prepare, sign, release, reconcile) on this instance's node.

***

### execution

> `readonly` **execution**: `object`

Defined in: [packages/sdk/src/index.ts:560](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L560)

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

Defined in: [packages/sdk/src/index.ts:562](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L562)

What decided `execution`: "target", "network", "execution" or "defaultNetwork".

***

### experimental

> `readonly` **experimental**: [`HardkasExperimental`](HardkasExperimental.md)

Defined in: [packages/sdk/src/index.ts:489](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L489)

***

### fees

> `readonly` **fees**: [`HardkasFees`](HardkasFees.md)

Defined in: [packages/sdk/src/index.ts:490](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L490)

***

### kcc20

> `readonly` **kcc20**: [`HardkasKcc20`](HardkasKcc20.md)

Defined in: [packages/sdk/src/index.ts:495](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L495)

R3-A3 · KCC-20 tokens on a node (deploy, transfer, balance) through the v1 engine of `covenants`.

***

### l2

> `readonly` **l2**: [`HardkasL2`](HardkasL2.md)

Defined in: [packages/sdk/src/index.ts:496](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L496)

***

### lineage

> `readonly` **lineage**: [`HardkasLineage`](HardkasLineage.md)

Defined in: [packages/sdk/src/index.ts:487](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L487)

***

### localnet

> `readonly` **localnet**: [`HardkasLocalnet`](HardkasLocalnet.md)

Defined in: [packages/sdk/src/index.ts:486](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L486)

***

### mode

> `readonly` **mode**: `"developer"` \| `"agent"`

Defined in: [packages/sdk/src/index.ts:549](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L549)

***

### node

> `readonly` **node**: `HardkasNodeApi`

Defined in: [packages/sdk/src/index.ts:481](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L481)

***

### observe

> `readonly` **observe**: `HardkasObserve`

Defined in: [packages/sdk/src/index.ts:500](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L500)

***

### plugins

> `readonly` **plugins**: `HardkasPluginManager`

Defined in: [packages/sdk/src/index.ts:488](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L488)

***

### policy

> `readonly` **policy**: `Required`\<`NonNullable`\<[`HardkasOptions`](../interfaces/HardkasOptions.md)\[`"policy"`\]\>\>

Defined in: [packages/sdk/src/index.ts:550](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L550)

***

### query

> `readonly` **query**: [`HardkasQuery`](HardkasQuery.md)

Defined in: [packages/sdk/src/index.ts:501](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L501)

***

### replay

> `readonly` **replay**: [`HardkasReplay`](HardkasReplay.md)

Defined in: [packages/sdk/src/index.ts:498](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L498)

***

### rpc

> `readonly` **rpc**: `KaspaRpcClient`

Defined in: [packages/sdk/src/index.ts:552](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L552)

***

### signer?

> `readonly` `optional` **signer?**: `ExternalHardkasSigner`

Defined in: [packages/sdk/src/index.ts:547](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L547)

***

### tx

> `readonly` **tx**: [`HardkasTx`](HardkasTx.md)

Defined in: [packages/sdk/src/index.ts:484](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L484)

***

### utxos

> `readonly` **utxos**: `HardkasUtxos`

Defined in: [packages/sdk/src/index.ts:485](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L485)

***

### wallet

> `readonly` **wallet**: `object`

Defined in: [packages/sdk/src/index.ts:503](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L503)

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

Defined in: [packages/sdk/src/index.ts:499](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L499)

***

### workspace

> `readonly` **workspace**: [`HardkasWorkspace`](HardkasWorkspace.md)

Defined in: [packages/sdk/src/index.ts:480](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L480)

## Accessors

### cwd

#### Get Signature

> **get** **cwd**(): `string`

Defined in: [packages/sdk/src/index.ts:781](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L781)

##### Returns

`string`

***

### network

#### Get Signature

> **get** **network**(): [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: [packages/sdk/src/index.ts:773](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L773)

The network this instance runs on: the network of its resolved execution target (WORKSPACE-AUTHORITY-2), not a
reading of the legacy `defaultNetwork` key.

##### Returns

[`NetworkId`](../type-aliases/NetworkId.md)

***

### sdkConfig

#### Get Signature

> **get** **sdkConfig**(): `HardkasConfig`

Defined in: [packages/sdk/src/index.ts:777](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L777)

##### Returns

`HardkasConfig`

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [packages/sdk/src/index.ts:752](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L752)

Releases what this instance created (its own RPC client), so a process that is done with the SDK can end by
itself. Never a client it was given, or one assigned to `rpc` afterwards: that one is its caller's. Idempotent; it
never throws, so it fits a `finally`. A later call that needs the node opens a new connection, which a later
close() releases.

#### Returns

`Promise`\<`void`\>

***

### enforcePolicy()

> **enforcePolicy**(`action`, `context?`): `void`

Defined in: [packages/sdk/src/index.ts:789](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L789)

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

Defined in: [packages/sdk/src/index.ts:765](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L765)

Alias for open(). Used in most examples.

#### Parameters

##### dirOrOptions?

`string` \| [`HardkasOptions`](../interfaces/HardkasOptions.md)

#### Returns

`Promise`\<`Hardkas`\>

***

### open()

> `static` **open**(`dirOrOptions?`): `Promise`\<`Hardkas`\>

Defined in: [packages/sdk/src/index.ts:658](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L658)

Opens a HardKAS project in the given directory.

#### Parameters

##### dirOrOptions?

`string` \| [`HardkasOptions`](../interfaces/HardkasOptions.md)

#### Returns

`Promise`\<`Hardkas`\>
