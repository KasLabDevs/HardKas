[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyGroth16Math

# Function: verifyGroth16Math()

> **verifyGroth16Math**(`vk`, `publicInputs`, `proof`, `options?`): `Promise`\<[`Groth16MathVerificationOutput`](../interfaces/Groth16MathVerificationOutput.md)\>

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:671](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L671)

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

\[`string`, `string`, `string`\][]

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

\[`string`, `string`, `string`\]

#### vk_alphabeta_12?

`any`[]

#### vk_beta_2?

\[\[`string`, `string`\], \[`string`, `string`\], \[`string`, `string`\]\]

#### vk_delta_2?

\[\[`string`, `string`\], \[`string`, `string`\], \[`string`, `string`\]\]

#### vk_gamma_2?

\[\[`string`, `string`\], \[`string`, `string`\], \[`string`, `string`\]\]

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

\[`string`, `string`, `string`\]

#### pi_b

\[\[`string`, `string`\], \[`string`, `string`\], \[`string`, `string`\]\]

#### pi_c

\[`string`, `string`, `string`\]

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
