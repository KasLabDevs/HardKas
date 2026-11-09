[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / PINNED\_GROTH16\_VERIFICATION\_KEYS

# Variable: PINNED\_GROTH16\_VERIFICATION\_KEYS

> `const` **PINNED\_GROTH16\_VERIFICATION\_KEYS**: readonly [`PinnedGroth16VerificationKey`](../interfaces/PinnedGroth16VerificationKey.md)[]

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:154](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L154)

Keys pinned in this code. Pinning anchors the IDENTITY of a key (these exact curve points), not its
soundness: a known-trapdoor toy stays weak and still needs allowWeakVerificationKey.
