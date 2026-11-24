[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Groth16VerifyMathOptions

# Interface: Groth16VerifyMathOptions

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:82](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L82)

## Extended by

- [`ZkProofMathOptions`](ZkProofMathOptions.md)

## Properties

### allowWeakVerificationKey?

> `optional` **allowWeakVerificationKey?**: `boolean`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:86](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L86)

Accept a verification key whose trusted setup is provably weak (toy fixtures only).

***

### expectedVerificationKeyHash?

> `optional` **expectedVerificationKeyHash?**: `string`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:92](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L92)

Pin (anchor) for the verification key, obtained from a source the caller trusts. Accepted forms:
the key's portable fingerprint (`summary.verificationKeyFingerprint`, groth16VerificationKeyFingerprint)
or its legacy object digest (`summary.verificationKeyHash`). A mismatch rejects before any pairing.

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:84](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L84)

Wall-clock budget for the pairing check; the verification worker is terminated when it elapses.
