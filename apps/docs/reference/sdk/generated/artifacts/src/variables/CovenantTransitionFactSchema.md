[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / CovenantTransitionFactSchema

# Variable: CovenantTransitionFactSchema

> `const` **CovenantTransitionFactSchema**: `ZodObject`\<\{ `artifactSha256`: `ZodString`; `contentHash`: `ZodOptional`\<`ZodString`\>; `contractName`: `ZodString`; `covenantId`: `ZodString`; `draftArtifactId`: `ZodOptional`\<`ZodString`\>; `entrypoint`: `ZodString`; `hardkasVersion`: `ZodString`; `hashVersion`: `ZodUnion`\<readonly \[`ZodNumber`, `ZodString`\]\>; `networkId`: `ZodEnum`\<\{ `devnet`: `"devnet"`; `igra`: `"igra"`; `mainnet`: `"mainnet"`; `simnet`: `"simnet"`; `simnet-1`: `"simnet-1"`; `simulated`: `"simulated"`; `testnet-10`: `"testnet-10"`; `testnet-11`: `"testnet-11"`; `testnet-12`: `"testnet-12"`; \}\>; `nextState`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `planArtifactId`: `ZodString`; `policy`: `ZodOptional`\<`ZodString`\>; `previousState`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `schema`: `ZodLiteral`\<`"hardkas.covenantTransitionFact.v1"`\>; `spentOutpoint`: `ZodObject`\<\{ `index`: `ZodNumber`; `transactionId`: `ZodString`; \}, `$strip`\>; `successorAmountSompi`: `ZodOptional`\<`ZodString`\>; `successorOutpoint`: `ZodOptional`\<`ZodObject`\<\{ `index`: `ZodNumber`; `transactionId`: `ZodString`; \}, `$strip`\>\>; `timestamp`: `ZodString`; `txId`: `ZodString`; `validation`: `ZodObject`\<\{ `diagnostic`: `ZodOptional`\<`ZodString`\>; `scriptVmPassed`: `ZodOptional`\<`ZodBoolean`\>; `structuralPassed`: `ZodBoolean`; `vmStatus`: `ZodOptional`\<`ZodString`\>; \}, `$strip`\>; \}, `$strip`\>

Defined in: [packages/artifacts/src/schemas.ts:1901](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L1901)

hardkas.covenantTransitionFact.v1
Immutable fact capturing the full context of a covenant transition:
identity, contract ABI, entrypoint, state before/after, consumed/successor outpoints,
plan, and validation results.
