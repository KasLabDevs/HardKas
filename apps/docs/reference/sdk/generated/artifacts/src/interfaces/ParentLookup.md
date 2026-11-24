[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ParentLookup

# Interface: ParentLookup

Defined in: [packages/artifacts/src/lineage-chain.ts:24](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/lineage-chain.ts#L24)

## Properties

### resolveArtifact?

> `optional` **resolveArtifact?**: (`artifactId`) => `any`

Defined in: [packages/artifacts/src/lineage-chain.ts:28](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/lineage-chain.ts#L28)

Looked at first; what it returns must verify as the referenced identity.

#### Parameters

##### artifactId

`string`

#### Returns

`any`

***

### workspaceRoot?

> `optional` **workspaceRoot?**: `string`

Defined in: [packages/artifacts/src/lineage-chain.ts:26](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/lineage-chain.ts#L26)

The workspace whose store is searched.
