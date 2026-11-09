[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Groth16VerificationKeyAnchor

# Type Alias: Groth16VerificationKeyAnchor

> **Groth16VerificationKeyAnchor** = `"CALLER_PIN"` \| `"PINNED_REGISTRY"` \| `"UNANCHORED"`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:79](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L79)

Where the trust in the verification key comes from.
  CALLER_PIN       the caller passed expectedVerificationKeyHash and the key matches it;
  PINNED_REGISTRY  the key's fingerprint is in PINNED_GROTH16_VERIFICATION_KEYS (pinned in this code);
  UNANCHORED       neither: the key is whatever was found next to the proof.
Only an anchored key can produce ZK_GROTH16_MATH_VERIFIED (HK-04).
