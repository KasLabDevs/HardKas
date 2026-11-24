[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkMathVerificationClaim

# Type Alias: ZkMathVerificationClaim

> **ZkMathVerificationClaim** = `"GROTH16_SNARKJS_BN254_PINNED_VK"` \| `"GROTH16_SNARKJS_BN254_UNANCHORED_VK"` \| `"GROTH16_SNARKJS_BN254_PINNED_VK_ONLY"`

Defined in: [packages/sdk/src/zk.ts:222](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L222)

What a mathematical verification result claims.
  GROTH16_SNARKJS_BN254_PINNED_VK       pairing checked against an anchored (pinned) key;
  GROTH16_SNARKJS_BN254_UNANCHORED_VK   pairing checked against a key nobody vouched for;
  GROTH16_SNARKJS_BN254_PINNED_VK_ONLY  capability: VERIFIED is only ever claimed for a pinned key.
