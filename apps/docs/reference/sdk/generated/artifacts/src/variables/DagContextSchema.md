[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / DagContextSchema

# Variable: DagContextSchema

> `const` **DagContextSchema**: `ZodObject`\<\{ `acceptedTxIds`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `branchId`: `ZodOptional`\<`ZodString`\>; `conflictSet`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `loserTxIds`: `ZodArray`\<`ZodString`\>; `outpoint`: `ZodString`; `winnerTxId`: `ZodString`; \}, `$strip`\>\>\>; `displacedTxIds`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `mode`: `ZodEnum`\<\{ `dag-light`: `"dag-light"`; `linear`: `"linear"`; \}\>; `nonSelectedContext`: `ZodOptional`\<`ZodBoolean`\>; `selectedParent`: `ZodOptional`\<`ZodString`\>; `sink`: `ZodString`; \}, `$strip`\>

Defined in: [packages/artifacts/src/schemas.ts:326](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L326)
