[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyZkProofMath

# Function: verifyZkProofMath()

> **verifyZkProofMath**(`targetPath`, `workspaceRoot?`, `options?`): `Promise`\<[`ZkProofMathVerifyResult`](../interfaces/ZkProofMathVerifyResult.md)\>

Defined in: [packages/sdk/src/zk.ts:678](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L678)

Mathematical (pairing) verification of a Groth16 fixture.

Default binding = FIXTURE_COHERENCE_SELF_ATTESTED: the proof, public inputs and verification key must
first pass the fixture's own coherence check (manifest content hashes, cross hashes, coherence digest).
That binding is SELF-ATTESTED: the digests are unkeyed and the manifest sits in the same directory, so
whoever writes the directory writes the binding. It catches accidents and swapped files; it is never
provenance and never anchors the key. `mathOnly` skips it and says so in `summary.binding`.

Trust in the key comes only from an ANCHOR: `expectedVerificationKeyHash` (a pin the caller obtained from
a trusted source: the key fingerprint or its legacy digest) or the in-code registry
PINNED_GROTH16_VERIFICATION_KEYS. A passing pairing against an unanchored key is reported as
ZK_GROTH16_MATH_VALID_UNANCHORED_VK (ok/verified false), never ZK_GROTH16_MATH_VERIFIED (HK-04).
Non-canonical encodings, off-curve and non-subgroup points are rejected before the weak-key heuristic
and before snarkjs; the heuristic itself only detects accidents (allowWeakVerificationKey for toys).
None of this says anything about on-chain acceptance.

## Parameters

### targetPath

`string`

### workspaceRoot?

`string` = `...`

### options?

[`ZkProofMathOptions`](../interfaces/ZkProofMathOptions.md) = `{}`

## Returns

`Promise`\<[`ZkProofMathVerifyResult`](../interfaces/ZkProofMathVerifyResult.md)\>
