[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / PinnedGroth16VerificationKey

# Interface: PinnedGroth16VerificationKey

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:140](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L140)

## Properties

### fingerprint

> `readonly` **fingerprint**: `string`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:144](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L144)

groth16VerificationKeyFingerprint of the key.

***

### id

> `readonly` **id**: `string`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:142](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L142)

Stable id (corpus entries reference it as pinnedVerificationKeyId).

***

### knownTrapdoor

> `readonly` **knownTrapdoor**: `boolean`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:147](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L147)

The key's trapdoor is public: proofs against it prove nothing (allowWeakVerificationKey required).

***

### source

> `readonly` **source**: `string`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:149](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L149)

Where the key comes from.

***

### trust

> `readonly` **trust**: `"TOY_KNOWN_TRAPDOOR"` \| `"OFFICIAL_UPSTREAM_RELEASE"`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:145](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/groth16-verifier.ts#L145)
