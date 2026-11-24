[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasOptions

# Interface: HardkasOptions

Defined in: [packages/sdk/src/index.ts:429](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L429)

## Properties

### autoBootstrap?

> `optional` **autoBootstrap?**: `boolean`

Defined in: [packages/sdk/src/index.ts:446](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L446)

***

### configPath?

> `optional` **configPath?**: `string`

Defined in: [packages/sdk/src/index.ts:431](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L431)

***

### cwd?

> `optional` **cwd?**: `string`

Defined in: [packages/sdk/src/index.ts:430](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L430)

***

### hardkasDir?

> `optional` **hardkasDir?**: `string`

Defined in: [packages/sdk/src/index.ts:433](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L433)

***

### logger?

> `optional` **logger?**: `object`

Defined in: [packages/sdk/src/index.ts:454](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L454)

#### Index Signature

\[`key`: `string`\]: `any`

#### debug

> **debug**: (`msg`) => `void`

##### Parameters

###### msg

`string`

##### Returns

`void`

#### error

> **error**: (`msg`) => `void`

##### Parameters

###### msg

`string`

##### Returns

`void`

#### info

> **info**: (`msg`) => `void`

##### Parameters

###### msg

`string`

##### Returns

`void`

#### warn

> **warn**: (`msg`) => `void`

##### Parameters

###### msg

`string`

##### Returns

`void`

***

### mode?

> `optional` **mode?**: `"developer"` \| `"agent"`

Defined in: [packages/sdk/src/index.ts:434](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L434)

***

### network?

> `optional` **network?**: `string`

Defined in: [packages/sdk/src/index.ts:440](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L440)

A network id (a key of the config's `networks`, built-ins included: simulated, simnet, devnet, testnet-10, mainnet…)
to run on instead of the workspace's default execution target. Validated as a network id — never read as a target
name; with `target` it must be that target's network.

***

### policy?

> `optional` **policy?**: `object`

Defined in: [packages/sdk/src/index.ts:461](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L461)

#### allowExternalWallet?

> `optional` **allowExternalWallet?**: `boolean`

#### allowNetwork?

> `optional` **allowNetwork?**: `boolean`

#### allowPublic?

> `optional` **allowPublic?**: `boolean`

#### requireDryRun?

> `optional` **requireDryRun?**: `boolean`

***

### requireSyncedNode?

> `optional` **requireSyncedNode?**: `boolean`

Defined in: [packages/sdk/src/index.ts:452](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L452)

INT9-A (I-3b): the default RPC client of a real Kaspa world also refuses (NODE_NOT_SYNCED) a node that does not say
it is synced — for callers whose operations need the current chain state (the CLI's `tx wait`). Off by default:
a well-identified node is used for reads and diagnostics whatever its sync state.

***

### signer?

> `optional` **signer?**: `ExternalHardkasSigner`

Defined in: [packages/sdk/src/index.ts:453](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L453)

***

### target?

> `optional` **target?**: `string`

Defined in: [packages/sdk/src/index.ts:445](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L445)

WORKSPACE-AUTHORITY-2: a named execution target of the config (`execution.targets[name]`, as `--target` in the
CLI). Without `target` and `network` the workspace's `execution.default` (or its single `execution`) decides.

***

### wasm?

> `optional` **wasm?**: `object`

Defined in: [packages/sdk/src/index.ts:467](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L467)

#### path?

> `optional` **path?**: `string`

#### provider

> **provider**: `"managed"` \| `"local"` \| `"release-asset"`

***

### workspaceRoot?

> `optional` **workspaceRoot?**: `string`

Defined in: [packages/sdk/src/index.ts:432](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/index.ts#L432)
