[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / validateVerificationKeyStructure

# Function: validateVerificationKeyStructure()

> **validateVerificationKeyStructure**(`vk`, `issues`): `boolean`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:433](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L433)

Validates the verification key's structure: every point canonical, on the curve and (G2) in the
subgroup, IC non-empty, nPublic consistent.

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

### issues

`ZkIssue`[]

## Returns

`boolean`
