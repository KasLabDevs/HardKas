[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ZkProofMathVerificationSchema

# Variable: ZkProofMathVerificationSchema

> `const` **ZkProofMathVerificationSchema**: `ZodObject`\<\{ `claims`: `ZodRecord`\<`ZodString`, `ZodString`\>; `curve`: `ZodString`; `durationMs`: `ZodNumber`; `engine`: `ZodLiteral`\<`"snarkjs-bn254"`\>; `experimental`: `ZodLiteral`\<`true`\>; `issues`: `ZodArray`\<`ZodObject`\<\{ `code`: `ZodString`; `file`: `ZodOptional`\<`ZodString`\>; `message`: `ZodString`; \}, `$strip`\>\>; `path`: `ZodString`; `proofSystem`: `ZodLiteral`\<`"groth16"`\>; `schema`: `ZodLiteral`\<`"hardkas.zkProofMathVerification.v1"`\>; `status`: `ZodEnum`\<\{ `ZK_GROTH16_MATH_REJECTED`: `"ZK_GROTH16_MATH_REJECTED"`; `ZK_GROTH16_MATH_VALID_UNANCHORED_VK`: `"ZK_GROTH16_MATH_VALID_UNANCHORED_VK"`; `ZK_GROTH16_MATH_VERIFIED`: `"ZK_GROTH16_MATH_VERIFIED"`; `ZK_GROTH16_VERIFIER_ERROR`: `"ZK_GROTH16_VERIFIER_ERROR"`; \}\>; `summary`: `ZodObject`\<\{ `binding`: `ZodEnum`\<\{ `FIXTURE_COHERENCE_SELF_ATTESTED`: `"FIXTURE_COHERENCE_SELF_ATTESTED"`; `MATH_ONLY`: `"MATH_ONLY"`; \}\>; `curve`: `ZodString`; `mathCheck`: `ZodEnum`\<\{ `ERROR`: `"ERROR"`; `FAIL`: `"FAIL"`; `PASS`: `"PASS"`; \}\>; `pinnedVerificationKeyId`: `ZodOptional`\<`ZodString`\>; `proofHash`: `ZodString`; `proofSystem`: `ZodString`; `publicInputsHash`: `ZodString`; `publicSignals`: `ZodArray`\<`ZodString`\>; `verificationKeyAnchor`: `ZodEnum`\<\{ `CALLER_PIN`: `"CALLER_PIN"`; `PINNED_REGISTRY`: `"PINNED_REGISTRY"`; `UNANCHORED`: `"UNANCHORED"`; \}\>; `verificationKeyFingerprint`: `ZodString`; `verificationKeyHash`: `ZodString`; `verificationKeyStrength`: `ZodEnum`\<\{ `NO_KNOWN_WEAKNESS`: `"NO_KNOWN_WEAKNESS"`; `WEAK_TRAPDOOR_SUSPECTED`: `"WEAK_TRAPDOOR_SUSPECTED"`; \}\>; \}, `$strip`\>; `verified`: `ZodBoolean`; \}, `$strip`\>

Defined in: [packages/artifacts/src/schemas.ts:1713](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L1713)
