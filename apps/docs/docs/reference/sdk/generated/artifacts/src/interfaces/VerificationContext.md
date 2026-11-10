[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / VerificationContext

# Interface: VerificationContext

Defined in: [packages/artifacts/src/verify.ts:70](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L70)

## Properties

### artifactsDir?

> `optional` **artifactsDir?**: `string`

Defined in: [packages/artifacts/src/verify.ts:78](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L78)

Legacy locator of the store (`<workspaceRoot>/.hardkas/artifacts`); the root is derived from it.

***

### clock?

> `optional` **clock?**: [`Clock`](Clock.md)

Defined in: [packages/artifacts/src/verify.ts:71](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L71)

***

### enforceMetadata?

> `optional` **enforceMetadata?**: `boolean`

Defined in: [packages/artifacts/src/verify.ts:79](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L79)

***

### networkId?

> `optional` **networkId?**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/verify.ts:73](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L73)

***

### parent?

> `optional` **parent?**: `unknown`

Defined in: [packages/artifacts/src/verify.ts:74](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L74)

***

### resolveArtifact?

> `optional` **resolveArtifact?**: (`id`) => `any`

Defined in: [packages/artifacts/src/verify.ts:81](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L81)

Optional override returning an already-verified artifact for a 64-hex artifactId, or null.

#### Parameters

##### id

`string`

#### Returns

`any`

***

### strict?

> `optional` **strict?**: `boolean`

Defined in: [packages/artifacts/src/verify.ts:72](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L72)

***

### visitedArtifacts?

> `optional` **visitedArtifacts?**: `Set`\<`string`\>

Defined in: [packages/artifacts/src/verify.ts:82](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L82)

***

### workspaceRoot?

> `optional` **workspaceRoot?**: `string`

Defined in: [packages/artifacts/src/verify.ts:76](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L76)

The workspace whose store resolves persisted references (IC-5′.7).
