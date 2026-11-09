[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / DagContextSchema

# Variable: DagContextSchema

> `const` **DagContextSchema**: `ZodObject`\<\{ `acceptedTxIds`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `branchId`: `ZodOptional`\<`ZodString`\>; `conflictSet`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `loserTxIds`: `ZodArray`\<`ZodString`, `"many"`\>; `outpoint`: `ZodString`; `winnerTxId`: `ZodString`; \}, `"strip"`, `ZodTypeAny`, \{ `loserTxIds?`: `string`[]; `outpoint?`: `string`; `winnerTxId?`: `string`; \}, \{ `loserTxIds?`: `string`[]; `outpoint?`: `string`; `winnerTxId?`: `string`; \}\>, `"many"`\>\>; `displacedTxIds`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `mode`: `ZodEnum`\<\[`"linear"`, `"dag-light"`\]\>; `nonSelectedContext`: `ZodOptional`\<`ZodBoolean`\>; `selectedParent`: `ZodOptional`\<`ZodString`\>; `sink`: `ZodString`; \}, `"strip"`, `ZodTypeAny`, \{ `acceptedTxIds?`: `string`[]; `branchId?`: `string`; `conflictSet?`: `object`[]; `displacedTxIds?`: `string`[]; `mode?`: `"linear"` \| `"dag-light"`; `nonSelectedContext?`: `boolean`; `selectedParent?`: `string`; `sink?`: `string`; \}, \{ `acceptedTxIds?`: `string`[]; `branchId?`: `string`; `conflictSet?`: `object`[]; `displacedTxIds?`: `string`[]; `mode?`: `"linear"` \| `"dag-light"`; `nonSelectedContext?`: `boolean`; `selectedParent?`: `string`; `sink?`: `string`; \}\>

Defined in: [packages/artifacts/src/schemas.ts:308](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/schemas.ts#L308)
