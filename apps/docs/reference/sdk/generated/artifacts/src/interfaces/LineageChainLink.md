[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / LineageChainLink

# Interface: LineageChainLink

Defined in: [packages/artifacts/src/lineage-chain.ts:77](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/lineage-chain.ts#L77)

## Properties

### artifactId

> **artifactId**: `string`

Defined in: [packages/artifacts/src/lineage-chain.ts:79](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/lineage-chain.ts#L79)

The artifact this link names (the content hash of a resolved copy; the reference for one that is not).

***

### detail?

> `optional` **detail?**: `string`

Defined in: [packages/artifacts/src/lineage-chain.ts:83](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/lineage-chain.ts#L83)

***

### schema?

> `optional` **schema?**: `string`

Defined in: [packages/artifacts/src/lineage-chain.ts:80](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/lineage-chain.ts#L80)

***

### status

> **status**: `"invalid"` \| `"resolved"` \| `"missing"` \| `"unresolved"` \| `"here"`

Defined in: [packages/artifacts/src/lineage-chain.ts:82](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/lineage-chain.ts#L82)

"here" is the artifact the chain starts from; the others are its ancestors, as looked up.
