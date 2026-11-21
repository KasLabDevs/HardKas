[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ZkVerificationFactSchema

# Variable: ZkVerificationFactSchema

> `const` **ZkVerificationFactSchema**: `ZodObject`\<\{ `computeBudget`: `ZodNumber`; `contentHash`: `ZodOptional`\<`ZodString`\>; `curve`: `ZodLiteral`\<`"BN254"`\>; `draftArtifactId`: `ZodOptional`\<`ZodString`\>; `feeSompi`: `ZodString`; `guestSystem`: `ZodEnum`\<\{ `custom`: `"custom"`; `RISC Zero`: `"RISC Zero"`; \}\>; `hardkasVersion`: `ZodString`; `hashVersion`: `ZodUnion`\<readonly \[`ZodNumber`, `ZodString`\]\>; `imageId`: `ZodString`; `journalHash`: `ZodString`; `networkId`: `ZodEnum`\<\{ `devnet`: `"devnet"`; `igra`: `"igra"`; `mainnet`: `"mainnet"`; `simnet`: `"simnet"`; `simnet-1`: `"simnet-1"`; `simulated`: `"simulated"`; `testnet-10`: `"testnet-10"`; `testnet-11`: `"testnet-11"`; `testnet-12`: `"testnet-12"`; \}\>; `offChainVerification`: `ZodOptional`\<`ZodEnum`\<\{ `FAILED`: `"FAILED"`; `NOT_PERFORMED`: `"NOT_PERFORMED"`; `VERIFIED`: `"VERIFIED"`; \}\>\>; `offChainVerifier`: `ZodOptional`\<`ZodString`\>; `p2shAddress`: `ZodString`; `payoutAddress`: `ZodString`; `payoutSompi`: `ZodString`; `planArtifactId`: `ZodOptional`\<`ZodString`\>; `proofSha256`: `ZodString`; `provingSystem`: `ZodLiteral`\<`"Groth16"`\>; `redeemScriptHash`: `ZodString`; `schema`: `ZodLiteral`\<`"hardkas.zkVerificationFact.v1"`\>; `spendUtxo`: `ZodObject`\<\{ `amountSompi`: `ZodString`; `index`: `ZodNumber`; `transactionId`: `ZodString`; \}, `$strip`\>; `timestamp`: `ZodOptional`\<`ZodString`\>; `txId`: `ZodString`; `verifiedOffChain`: `ZodBoolean`; \}, `$strip`\>

Defined in: [packages/artifacts/src/schemas.ts:1941](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L1941)

hardkas.zkVerificationFact.v1
Immutable fact capturing the cryptographic verification and transaction lineage
of a Zero-Knowledge proof execution on Kaspa Toccata.
