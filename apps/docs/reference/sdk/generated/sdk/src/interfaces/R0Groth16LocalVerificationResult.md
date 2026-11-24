[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / R0Groth16LocalVerificationResult

# Interface: R0Groth16LocalVerificationResult

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:281](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L281)

## Properties

### bn254ControlId

> **bn254ControlId**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:297](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L297)

***

### claimDigest

> **claimDigest**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:289](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L289)

Claim digest computed from (imageId, journalHash): the proof is checked against THIS claim.

***

### compressedProof

> **compressedProof**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:293](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L293)

128-byte arkworks-compressed proof derived from the seal (what the signature script pushes).

***

### controlRoot

> **controlRoot**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:296](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L296)

***

### durationMs

> **durationMs**: `number`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:299](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L299)

***

### imageId

> **imageId**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:286](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L286)

***

### issues

> **issues**: `object`[]

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:300](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L300)

#### code

> **code**: `string`

#### message

> **message**: `string`

***

### journalHash

> **journalHash**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:287](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L287)

***

### math?

> `optional` **math?**: `object`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:298](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L298)

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

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:282](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L282)

***

### pinnedVerificationKeyId

> **pinnedVerificationKeyId**: `"risc0-groth16-bn254-v3.0.4"`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:295](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L295)

***

### publicSignals

> **publicSignals**: `string`[]

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:294](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L294)

***

### receiptClaimDigest

> **receiptClaimDigest**: `string`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:291](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L291)

Claim digest stored in the receipt when it is pruned ("" otherwise).

***

### status

> **status**: `"ZK_R0_GROTH16_RECEIPT_VERIFIED"` \| `"ZK_R0_GROTH16_RECEIPT_REJECTED"` \| `"ZK_R0_GROTH16_VERIFIER_ERROR"`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:284](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L284)

***

### verified

> **verified**: `boolean`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:283](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L283)

***

### verifier

> **verifier**: `"hardkas-r0-groth16-snarkjs-v1"`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:285](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L285)
