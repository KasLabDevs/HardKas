[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Groth16MathVerificationOutput

# Interface: Groth16MathVerificationOutput

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:100](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L100)

## Properties

### durationMs

> **durationMs**: `number`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:113](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L113)

***

### issues

> **issues**: `ZkIssue`[]

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:133](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L133)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:102](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L102)

True only for ZK_GROTH16_MATH_VERIFIED (pairing passed AND the key is anchored).

***

### status

> **status**: [`Groth16MathStatus`](../type-aliases/Groth16MathStatus.md)

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:112](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L112)

ZK_GROTH16_MATH_VERIFIED            pairing passed against an ANCHORED key;
ZK_GROTH16_MATH_VALID_UNANCHORED_VK pairing passed, but against a key nobody vouched for: the proof is
                                    consistent with THIS key, which says nothing about the statement;
ZK_GROTH16_MATH_REJECTED            refused (structure, canonical encoding, pin, weak key, or pairing);
ZK_GROTH16_VERIFIER_ERROR           the engine could not run (timeout, crash).

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:114](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L114)

#### curve

> **curve**: `string`

#### mathCheck

> **mathCheck**: `"PASS"` \| `"FAIL"` \| `"ERROR"`

Outcome of the pairing equation alone ("PASS" also for VALID_UNANCHORED_VK).

#### pinnedVerificationKeyId?

> `optional` **pinnedVerificationKeyId?**: `string`

Id of the matching entry of PINNED_GROTH16_VERIFICATION_KEYS, when there is one.

#### proofHash

> **proofHash**: `string`

Domain digest of the proof object that was used.

#### proofSystem

> **proofSystem**: `"groth16"`

#### publicInputsHash

> **publicInputsHash**: `string`

Domain digest of the public inputs object that was used.

#### publicSignals

> **publicSignals**: `string`[]

#### verificationKeyAnchor

> **verificationKeyAnchor**: [`Groth16VerificationKeyAnchor`](../type-aliases/Groth16VerificationKeyAnchor.md)

#### verificationKeyFingerprint

> **verificationKeyFingerprint**: `string`

Portable fingerprint of the key's curve points ("" when the key is not canonical).

#### verificationKeyHash

> **verificationKeyHash**: `string`

Domain digest (legacy corpus digest) of the verification key object that was used.

#### verificationKeyStrength

> **verificationKeyStrength**: [`Groth16VerificationKeyStrength`](../type-aliases/Groth16VerificationKeyStrength.md)

***

### verified

> **verified**: `boolean`

Defined in: [packages/sdk/src/zk/groth16-verifier.ts:104](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/groth16-verifier.ts#L104)

True only for ZK_GROTH16_MATH_VERIFIED.
