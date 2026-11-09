[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantLineageOptions

# Interface: CovenantLineageOptions

Defined in: [packages/sdk/src/covenants.ts:159](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L159)

V1-ENGINE-2 · what `lineage`, `inspect` and `getState` check.

## Properties

### compileRecords?

> `readonly` `optional` **compileRecords?**: readonly `Record`\<`string`, `any`\>[]

Defined in: [packages/sdk/src/covenants.ts:165](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L165)

***

### facts?

> `readonly` `optional` **facts?**: `V1EngineFacts`

Defined in: [packages/sdk/src/covenants.ts:164](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L164)

***

### node?

> `readonly` `optional` **node?**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:161](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L161)

Ask the node for the tip's outputs (default true; `getState` always asks).

***

### states?

> `readonly` `optional` **states?**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:163](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L163)

Check each tip output's declared state against its address (default true; a v1 contract's needs the pinned silverc).
