[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyGroth16Math

# Function: verifyGroth16Math()

> **verifyGroth16Math**(`vk`, `publicInputs`, `proof`, `options?`): `Promise`\<[`Groth16MathVerificationOutput`](../interfaces/Groth16MathVerificationOutput.md)\>

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:721](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L721)

Executes the Groth16 pairing check (snarkjs over BN254) after strict validation, and says how far the
result can be trusted.

The pairing only shows that (A, B, C) satisfies the Groth16 equation for THE KEY IT IS GIVEN; it says
nothing about where that key came from, and a key whose discrete logarithms are known to its maker
accepts forged proofs of false statements (CA-EXP-04b). So:
  - ZK_GROTH16_MATH_VERIFIED (ok/verified true) requires an ANCHORED key: the caller's
    expectedVerificationKeyHash (a pin obtained from a trusted source) or an entry of
    PINNED_GROTH16_VERIFICATION_KEYS;
  - without an anchor a passing pairing is ZK_GROTH16_MATH_VALID_UNANCHORED_VK (ok/verified false);
  - non-canonical encodings, off-curve points and G2 points outside the subgroup are rejected BEFORE the
    weakness heuristic and BEFORE snarkjs, so the key that is judged is the key snarkjs would check;
  - the weakness heuristic is an accident detector, never a substitute for a pin.
Fixture coherence (verifyZkProofMath's default binding) is self-attested and is NOT an anchor.

## Parameters

### vk

#### curve

`string`

#### IC?

\[`string`?, `string`?, `string`?, `...unknown[]`\][]

#### note?

`string`

#### nPublic?

`number`

#### protocol

`"groth16"`

#### schema

`"hardkas.zk.groth16.verificationKey.v1"`

#### statementHash?

`string`

#### verificationKeyId

`string`

#### vk_alpha_1?

\[`string`?, `string`?, `string`?, `...unknown[]`\]

#### vk_alphabeta_12?

`any`[]

#### vk_beta_2?

\[\[`string`?, `string`?, `...unknown[]`\]?, \[`string`?, `string`?, `...unknown[]`\]?, \[`string`?, `string`?, `...unknown[]`\]?, `...unknown[]`\]

#### vk_delta_2?

\[\[`string`?, `string`?, `...unknown[]`\]?, \[`string`?, `string`?, `...unknown[]`\]?, \[`string`?, `string`?, `...unknown[]`\]?, `...unknown[]`\]

#### vk_gamma_2?

\[\[`string`?, `string`?, `...unknown[]`\]?, \[`string`?, `string`?, `...unknown[]`\]?, \[`string`?, `string`?, `...unknown[]`\]?, `...unknown[]`\]

### publicInputs

#### publicSignals

`string`[]

#### schema

`"hardkas.zk.groth16.publicInputs.v1"`

#### statement?

`string`

#### statementHash?

`string`

### proof

#### curve

`string`

#### note?

`string`

#### pi_a

\[`string`?, `string`?, `string`?, `...unknown[]`\]

#### pi_b

\[\[`string`?, `string`?, `...unknown[]`\]?, \[`string`?, `string`?, `...unknown[]`\]?, \[`string`?, `string`?, `...unknown[]`\]?, `...unknown[]`\]

#### pi_c

\[`string`?, `string`?, `string`?, `...unknown[]`\]

#### proofId

`string`

#### protocol

`"groth16"`

#### publicInputsHash?

`string`

#### schema

`"hardkas.zk.groth16.proof.v1"`

#### verificationKeyHash?

`string`

### options?

[`Groth16VerifyMathOptions`](../interfaces/Groth16VerifyMathOptions.md) = `{}`

## Returns

`Promise`\<[`Groth16MathVerificationOutput`](../interfaces/Groth16MathVerificationOutput.md)\>
