[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantLineageOptions

# Interface: CovenantLineageOptions

Defined in: [packages/sdk/src/covenants.ts:170](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L170)

V1-ENGINE-2 · what `lineage`, `inspect` and `getState` check.

## Properties

### compileRecords?

> `readonly` `optional` **compileRecords?**: readonly `Record`\<`string`, `any`\>[]

Defined in: [packages/sdk/src/covenants.ts:176](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L176)

***

### facts?

> `readonly` `optional` **facts?**: `V1EngineFacts`

Defined in: [packages/sdk/src/covenants.ts:175](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L175)

***

### node?

> `readonly` `optional` **node?**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:172](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L172)

Ask the node for the tip's outputs (default true; `getState` always asks).

***

### states?

> `readonly` `optional` **states?**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:174](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L174)

Check each tip output's declared state against its address (default true; a v1 contract's needs the pinned silverc).
