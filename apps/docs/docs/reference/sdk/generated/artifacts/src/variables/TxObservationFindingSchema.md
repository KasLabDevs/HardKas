[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / TxObservationFindingSchema

# Variable: TxObservationFindingSchema

> `const` **TxObservationFindingSchema**: `ZodDiscriminatedUnion`\<`"type"`, \[`ZodObject`\<\{ `feeSompi`: `ZodOptional`\<`ZodString`\>; `isOrphan`: `ZodBoolean`; `scanComplete`: `ZodOptional`\<`ZodBoolean`\>; `scannedChainBlocks`: `ZodOptional`\<`ZodNumber`\>; `scannedFrom`: `ZodOptional`\<`ZodString`\>; `scannedTo`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"mempool_entry"`\>; \}, `"strip"`, `ZodTypeAny`, \{ `feeSompi?`: `string`; `isOrphan?`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type?`: `"mempool_entry"`; \}, \{ `feeSompi?`: `string`; `isOrphan?`: `boolean`; `scanComplete?`: `boolean`; `scannedChainBlocks?`: `number`; `scannedFrom?`: `string`; `scannedTo?`: `string`; `type?`: `"mempool_entry"`; \}\>, `ZodObject`\<\{ `type`: `ZodLiteral`\<`"mempool_absent"`\>; \}, `"strip"`, `ZodTypeAny`, \{ `type?`: `"mempool_absent"`; \}, \{ `type?`: `"mempool_absent"`; \}\>, `ZodObject`\<\{ `acceptingBlockHash`: `ZodString`; `acceptingBlueScore`: `ZodString`; `acceptingDaaScore`: `ZodOptional`\<`ZodString`\>; `confirmationsBlue`: `ZodString`; `confirmationsDaa`: `ZodOptional`\<`ZodString`\>; `removedAcceptingBlockHash`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"chain_accepted"`\>; \}, `"strip"`, `ZodTypeAny`, \{ `acceptingBlockHash?`: `string`; `acceptingBlueScore?`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue?`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type?`: `"chain_accepted"`; \}, \{ `acceptingBlockHash?`: `string`; `acceptingBlueScore?`: `string`; `acceptingDaaScore?`: `string`; `confirmationsBlue?`: `string`; `confirmationsDaa?`: `string`; `removedAcceptingBlockHash?`: `string`; `type?`: `"chain_accepted"`; \}\>\]\>

Defined in: [packages/artifacts/src/schemas.ts:527](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/schemas.ts#L527)

Wave 2(a) · IC-2′.3 · the typed finding of ONE observation. The consensus meaning
of each type is fixed by Q4 (ratified 2026-09-26); an observation is never a
consensus verdict by itself — `deriveTxStatus` turns a set of them into a state.
