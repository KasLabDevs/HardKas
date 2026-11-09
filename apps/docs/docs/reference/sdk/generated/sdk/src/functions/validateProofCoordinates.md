[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / validateProofCoordinates

# Function: validateProofCoordinates()

> **validateProofCoordinates**(`proof`, `issues`): `boolean`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:352](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L352)

Validates that the proof's points are canonically encoded, on the curve, and (G2) in the subgroup, with
coordinates in [0, q). Runs before any weakness heuristic and before snarkjs.

## Parameters

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

### issues

`ZkIssue`[]

## Returns

`boolean`
