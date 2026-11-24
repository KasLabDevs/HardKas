[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkProofMathOptions

# Interface: ZkProofMathOptions

Defined in: [packages/sdk/src/zk.ts:303](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L303)

## Extends

- [`Groth16VerifyMathOptions`](Groth16VerifyMathOptions.md)

## Properties

### allowWeakVerificationKey?

> `optional` **allowWeakVerificationKey?**: `boolean`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:86](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L86)

Accept a verification key whose trusted setup is provably weak (toy fixtures only).

#### Inherited from

[`Groth16VerifyMathOptions`](Groth16VerifyMathOptions.md).[`allowWeakVerificationKey`](Groth16VerifyMathOptions.md#allowweakverificationkey)

***

### expectedVerificationKeyHash?

> `optional` **expectedVerificationKeyHash?**: `string`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:92](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L92)

Pin (anchor) for the verification key, obtained from a source the caller trusts. Accepted forms:
the key's portable fingerprint (`summary.verificationKeyFingerprint`, groth16VerificationKeyFingerprint)
or its legacy object digest (`summary.verificationKeyHash`). A mismatch rejects before any pairing.

#### Inherited from

[`Groth16VerifyMathOptions`](Groth16VerifyMathOptions.md).[`expectedVerificationKeyHash`](Groth16VerifyMathOptions.md#expectedverificationkeyhash)

***

### mathOnly?

> `optional` **mathOnly?**: `boolean`

Defined in: [packages/sdk/src/zk.ts:309](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L309)

Skip the (self-attested) fixture-coherence check. The result then carries binding "MATH_ONLY".
Trust in the key still comes only from an anchor (expectedVerificationKeyHash or the in-code
registry): without one a passing pairing is ZK_GROTH16_MATH_VALID_UNANCHORED_VK.

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:84](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L84)

Wall-clock budget for the pairing check; the verification worker is terminated when it elapses.

#### Inherited from

[`Groth16VerifyMathOptions`](Groth16VerifyMathOptions.md).[`timeoutMs`](Groth16VerifyMathOptions.md#timeoutms)
