[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / BN254\_G1\_GENERATOR

# Variable: BN254\_G1\_GENERATOR

> `const` **BN254\_G1\_GENERATOR**: readonly \[`"1"`, `"2"`\]

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:46](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L46)

The canonical BN254 generators. A verification key whose alpha or beta equals its
 generator comes from an UNCONTRIBUTED powers-of-tau (tau = alpha = beta = 1): anyone
 can forge proofs for any public input against such a key (audit finding H-01).
