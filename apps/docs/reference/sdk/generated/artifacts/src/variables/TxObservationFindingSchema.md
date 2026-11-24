[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / TxObservationFindingSchema

# Variable: TxObservationFindingSchema

> `const` **TxObservationFindingSchema**: `ZodDiscriminatedUnion`\<\[`ZodObject`\<\{ `feeSompi`: `ZodOptional`\<`ZodString`\>; `isOrphan`: `ZodBoolean`; `scanComplete`: `ZodOptional`\<`ZodBoolean`\>; `scannedChainBlocks`: `ZodOptional`\<`ZodNumber`\>; `scannedFrom`: `ZodOptional`\<`ZodString`\>; `scannedTo`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"mempool_entry"`\>; \}, `$strip`\>, `ZodObject`\<\{ `type`: `ZodLiteral`\<`"mempool_absent"`\>; \}, `$strip`\>, `ZodObject`\<\{ `acceptingBlockHash`: `ZodString`; `acceptingBlueScore`: `ZodString`; `acceptingDaaScore`: `ZodOptional`\<`ZodString`\>; `confirmationsBlue`: `ZodString`; `confirmationsDaa`: `ZodOptional`\<`ZodString`\>; `removedAcceptingBlockHash`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"chain_accepted"`\>; \}, `$strip`\>\], `"type"`\>

Defined in: [packages/artifacts/src/schemas.ts:545](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L545)

Wave 2(a) · IC-2′.3 · the typed finding of ONE observation. The consensus meaning
of each type is fixed by Q4 (ratified 2026-09-26); an observation is never a
consensus verdict by itself — `deriveTxStatus` turns a set of them into a state.
