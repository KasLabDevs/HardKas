[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / validateVerificationKeyStructure

# Function: validateVerificationKeyStructure()

> **validateVerificationKeyStructure**(`vk`, `issues`): `boolean`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:431](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L431)

Validates the verification key's structure: every point canonical, on the curve and (G2) in the
subgroup, IC non-empty, nPublic consistent.

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

### issues

`ZkIssue`[]

## Returns

`boolean`
