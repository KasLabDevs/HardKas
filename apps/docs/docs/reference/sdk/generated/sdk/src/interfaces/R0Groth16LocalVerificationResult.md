[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16LocalVerificationResult

# Interface: R0Groth16LocalVerificationResult

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:246](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L246)

## Properties

### bn254ControlId

> **bn254ControlId**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:262](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L262)

***

### claimDigest

> **claimDigest**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:254](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L254)

Claim digest computed from (imageId, journalHash): the proof is checked against THIS claim.

***

### compressedProof

> **compressedProof**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:258](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L258)

128-byte arkworks-compressed proof derived from the seal (what the signature script pushes).

***

### controlRoot

> **controlRoot**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:261](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L261)

***

### durationMs

> **durationMs**: `number`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:264](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L264)

***

### imageId

> **imageId**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:251](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L251)

***

### issues

> **issues**: `object`[]

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:265](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L265)

#### code

> **code**: `string`

#### message

> **message**: `string`

***

### journalHash

> **journalHash**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:252](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L252)

***

### math?

> `optional` **math?**: `object`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:263](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L263)

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

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:247](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L247)

***

### pinnedVerificationKeyId

> **pinnedVerificationKeyId**: `"risc0-groth16-bn254-v3.0.4"`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:260](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L260)

***

### publicSignals

> **publicSignals**: `string`[]

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:259](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L259)

***

### receiptClaimDigest

> **receiptClaimDigest**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:256](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L256)

Claim digest stored in the receipt when it is pruned ("" otherwise).

***

### status

> **status**: `"ZK_R0_GROTH16_RECEIPT_VERIFIED"` \| `"ZK_R0_GROTH16_RECEIPT_REJECTED"` \| `"ZK_R0_GROTH16_VERIFIER_ERROR"`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:249](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L249)

***

### verified

> **verified**: `boolean`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:248](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L248)

***

### verifier

> **verifier**: `"hardkas-r0-groth16-snarkjs-v1"`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:250](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/risc0-groth16.ts#L250)
