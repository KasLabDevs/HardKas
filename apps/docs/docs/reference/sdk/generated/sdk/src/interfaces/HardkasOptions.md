[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasOptions

# Interface: HardkasOptions

Defined in: [packages/sdk/src/index.ts:266](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L266)

## Properties

### autoBootstrap?

> `optional` **autoBootstrap?**: `boolean`

Defined in: [packages/sdk/src/index.ts:283](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L283)

***

### configPath?

> `optional` **configPath?**: `string`

Defined in: [packages/sdk/src/index.ts:268](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L268)

***

### cwd?

> `optional` **cwd?**: `string`

Defined in: [packages/sdk/src/index.ts:267](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L267)

***

### hardkasDir?

> `optional` **hardkasDir?**: `string`

Defined in: [packages/sdk/src/index.ts:270](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L270)

***

### logger?

> `optional` **logger?**: `object`

Defined in: [packages/sdk/src/index.ts:285](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L285)

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

Defined in: [packages/sdk/src/index.ts:271](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L271)

***

### network?

> `optional` **network?**: `string`

Defined in: [packages/sdk/src/index.ts:277](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L277)

A network id (a key of the config's `networks`, built-ins included: simulated, simnet, devnet, testnet-10, mainnet…)
to run on instead of the workspace's default execution target. Validated as a network id — never read as a target
name; with `target` it must be that target's network.

***

### policy?

> `optional` **policy?**: `object`

Defined in: [packages/sdk/src/index.ts:292](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L292)

#### allowExternalWallet?

> `optional` **allowExternalWallet?**: `boolean`

#### allowNetwork?

> `optional` **allowNetwork?**: `boolean`

#### allowPublic?

> `optional` **allowPublic?**: `boolean`

#### requireDryRun?

> `optional` **requireDryRun?**: `boolean`

***

### signer?

> `optional` **signer?**: `ExternalHardkasSigner`

Defined in: [packages/sdk/src/index.ts:284](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L284)

***

### target?

> `optional` **target?**: `string`

Defined in: [packages/sdk/src/index.ts:282](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L282)

WORKSPACE-AUTHORITY-2: a named execution target of the config (`execution.targets[name]`, as `--target` in the
CLI). Without `target` and `network` the workspace's `execution.default` (or its single `execution`) decides.

***

### wasm?

> `optional` **wasm?**: `object`

Defined in: [packages/sdk/src/index.ts:298](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L298)

#### path?

> `optional` **path?**: `string`

#### provider

> **provider**: `"managed"` \| `"local"` \| `"release-asset"`

***

### workspaceRoot?

> `optional` **workspaceRoot?**: `string`

Defined in: [packages/sdk/src/index.ts:269](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/index.ts#L269)
