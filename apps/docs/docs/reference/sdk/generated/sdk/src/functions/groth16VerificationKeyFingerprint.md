[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / groth16VerificationKeyFingerprint

# Function: groth16VerificationKeyFingerprint()

> **groth16VerificationKeyFingerprint**(`vk`): `string`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:410](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L410)

Portable fingerprint of a Groth16 BN254 verification key (CA-ZK-04): SHA-256 over
  UTF-8(GROTH16_VK_FINGERPRINT_DOMAIN) || 0x00 ||
  alpha(x, y) || beta(x.c0, x.c1, y.c0, y.c1) || gamma(...) || delta(...) ||
  u32-BE(number of IC points) || IC_i(x, y)...
every coordinate as 32-byte big-endian affine values, the point at infinity as all-zero coordinates.
It covers exactly the curve points snarkjs and the precompile use, and none of the labels (ids, notes,
statement hashes), so anyone holding the same key computes the same value from its points.
Returns undefined when the key is not canonically encoded or not on the curve.

## Parameters

### vk

`unknown`

## Returns

`string`
