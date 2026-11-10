[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Groth16VerifyMathOptions

# Interface: Groth16VerifyMathOptions

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:81](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L81)

## Extended by

- [`ZkProofMathOptions`](ZkProofMathOptions.md)

## Properties

### allowWeakVerificationKey?

> `optional` **allowWeakVerificationKey?**: `boolean`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:85](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L85)

Accept a verification key whose trusted setup is provably weak (toy fixtures only).

***

### expectedVerificationKeyHash?

> `optional` **expectedVerificationKeyHash?**: `string`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:91](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L91)

Pin (anchor) for the verification key, obtained from a source the caller trusts. Accepted forms:
the key's portable fingerprint (`summary.verificationKeyFingerprint`, groth16VerificationKeyFingerprint)
or its legacy object digest (`summary.verificationKeyHash`). A mismatch rejects before any pairing.

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:83](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L83)

Wall-clock budget for the pairing check; the verification worker is terminated when it elapses.
