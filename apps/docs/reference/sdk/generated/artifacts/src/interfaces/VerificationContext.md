[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / VerificationContext

# Interface: VerificationContext

Defined in: [packages/artifacts/src/verify.ts:139](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L139)

## Properties

### artifactsDir?

> `optional` **artifactsDir?**: `string`

Defined in: [packages/artifacts/src/verify.ts:147](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L147)

Legacy locator of the store (`<workspaceRoot>/.hardkas/artifacts`); the root is derived from it.

***

### clock?

> `optional` **clock?**: [`Clock`](Clock.md)

Defined in: [packages/artifacts/src/verify.ts:140](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L140)

***

### enforceMetadata?

> `optional` **enforceMetadata?**: `boolean`

Defined in: [packages/artifacts/src/verify.ts:148](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L148)

***

### networkId?

> `optional` **networkId?**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/verify.ts:142](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L142)

***

### parent?

> `optional` **parent?**: `unknown`

Defined in: [packages/artifacts/src/verify.ts:143](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L143)

***

### resolveArtifact?

> `optional` **resolveArtifact?**: (`id`) => `any`

Defined in: [packages/artifacts/src/verify.ts:150](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L150)

Optional override returning an already-verified artifact for a 64-hex artifactId, or null.

#### Parameters

##### id

`string`

#### Returns

`any`

***

### strict?

> `optional` **strict?**: `boolean`

Defined in: [packages/artifacts/src/verify.ts:141](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L141)

***

### visitedArtifacts?

> `optional` **visitedArtifacts?**: `Set`\<`string`\>

Defined in: [packages/artifacts/src/verify.ts:151](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L151)

***

### workspaceRoot?

> `optional` **workspaceRoot?**: `string`

Defined in: [packages/artifacts/src/verify.ts:145](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L145)

The workspace whose store resolves persisted references (IC-5′.7).
