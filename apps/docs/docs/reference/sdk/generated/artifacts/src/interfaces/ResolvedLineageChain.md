[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ResolvedLineageChain

# Interface: ResolvedLineageChain

Defined in: [packages/artifacts/src/lineage-chain.ts:86](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage-chain.ts#L86)

## Properties

### complete

> **complete**: `boolean`

Defined in: [packages/artifacts/src/lineage-chain.ts:90](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage-chain.ts#L90)

True only when every ancestor was resolved up to a root, every link holds, and the root is the one declared.

***

### issues

> **issues**: [`VerificationIssue`](../type-aliases/VerificationIssue.md)[]

Defined in: [packages/artifacts/src/lineage-chain.ts:92](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage-chain.ts#L92)

What breaks the chain: a link that does not hold, the declared root not reached, a cycle, too many hops.

***

### links

> **links**: [`LineageChainLink`](LineageChainLink.md)[]

Defined in: [packages/artifacts/src/lineage-chain.ts:88](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage-chain.ts#L88)

From the artifact (first) up to the farthest ancestor reached (last).
