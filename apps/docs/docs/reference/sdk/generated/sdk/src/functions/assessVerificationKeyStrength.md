[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / assessVerificationKeyStrength

# Function: assessVerificationKeyStrength()

> **assessVerificationKeyStrength**(`vk`): `object`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:551](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L551)

Accident detector (NOT a security boundary): flags verification keys whose trusted setup is provably
weak — alpha or beta equal to the curve generator (uncontributed tau ceremony), beta equal to gamma,
IC[0] at infinity — and keys pinned in code as known-trapdoor toys. With such a key the discrete
logarithms are public and proofs can be forged for ANY public input (H-01). Points are compared as
group elements (encoding-independent). gamma = G2 generator is deliberately NOT a signal: honest snarkjs
keys and the RISC Zero production key have it (CA-ZK-01). A key with any other known trapdoor
(alpha = 2·G1, …) passes this check: only an anchor (pin) establishes trust in a key.

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

## Returns

`object`

### reasons

> **reasons**: `string`[]

### strength

> **strength**: [`Groth16VerificationKeyStrength`](../type-aliases/Groth16VerificationKeyStrength.md)
