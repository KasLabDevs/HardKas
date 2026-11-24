[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ZkExecutionEvidenceSchema

# Variable: ZkExecutionEvidenceSchema

> `const` **ZkExecutionEvidenceSchema**: `ZodObject`\<\{ `funding`: `ZodObject`\<\{ `accepted`: `ZodBoolean`; `amountSompi`: `ZodString`; `outputIndex`: `ZodNumber`; `txId`: `ZodString`; `utxoObserved`: `ZodBoolean`; \}, `$strip`\>; `guestSystem`: `ZodLiteral`\<`"RISC Zero"`\>; `imageId`: `ZodString`; `journalHash`: `ZodString`; `negativeCases`: `ZodArray`\<`ZodObject`\<\{ `expectedPattern`: `ZodString`; `matchedExpectedPattern`: `ZodBoolean`; `rawError`: `ZodOptional`\<`ZodString`\>; `rejected`: `ZodBoolean`; `testCase`: `ZodString`; \}, `$strip`\>\>; `networkId`: `ZodEnum`\<\{ `simnet`: `"simnet"`; `testnet-10`: `"testnet-10"`; \}\>; `node`: `ZodObject`\<\{ `harnessRunId`: `ZodOptional`\<`ZodString`\>; `rpcUrl`: `ZodString`; `serverVersion`: `ZodString`; `source`: `ZodEnum`\<\{ `external`: `"external"`; `simnet-harness`: `"simnet-harness"`; \}\>; \}, `$strip`\>; `notes`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `outcome`: `ZodEnum`\<\{ `ALL_AS_EXPECTED`: `"ALL_AS_EXPECTED"`; `DEVIATIONS`: `"DEVIATIONS"`; \}\>; `p2shAddress`: `ZodString`; `precompile`: `ZodObject`\<\{ `curve`: `ZodLiteral`\<`"BN254"`\>; `opcode`: `ZodLiteral`\<`"0xa6"`\>; `opcodeName`: `ZodLiteral`\<`"OpZkPrecompile"`\>; `provingSystem`: `ZodLiteral`\<`"Groth16"`\>; `tag`: `ZodLiteral`\<`"0x20"`\>; \}, `$strip`\>; `redeemScriptHash`: `ZodString`; `schema`: `ZodLiteral`\<`"hardkas.zk.executionEvidence.v1"`\>; `spend`: `ZodObject`\<\{ `accepted`: `ZodBoolean`; `blockDaaScore`: `ZodOptional`\<`ZodString`\>; `computeBudget`: `ZodNumber`; `feeSompi`: `ZodString`; `payoutAddress`: `ZodString`; `payoutSompi`: `ZodString`; `payoutUtxoObserved`: `ZodBoolean`; `rawError`: `ZodOptional`\<`ZodString`\>; `txId`: `ZodOptional`\<`ZodString`\>; \}, `$strip`\>; `timestamp`: `ZodString`; \}, `$strip`\>

Defined in: [packages/artifacts/src/schemas.ts:1829](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L1829)

Evidence of ONE run against ONE real node raised by the simnet harness. It records what the node
answered, including failures: nothing in this schema can only express success, and it carries no
score or maturity claim (Phase 3 remediation, L-07).
