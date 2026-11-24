[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkProofMathVerifyResult

# Interface: ZkProofMathVerifyResult

Defined in: [packages/sdk/src/zk.ts:312](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L312)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:344](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L344)

#### mainnet

> **mainnet**: `"BLOCKED_BY_POLICY"`

#### vmConsensusEquivalence

> **vmConsensusEquivalence**: `"NOT_CLAIMED"`

#### zkArtifactCoherence

> **zkArtifactCoherence**: `"EXPERIMENTAL"`

#### zkLocalVerification

> **zkLocalVerification**: `"EXPERIMENTAL_FIXTURE_ONLY"`

#### zkMathematicalVerification?

> `optional` **zkMathematicalVerification?**: [`ZkMathVerificationClaim`](../type-aliases/ZkMathVerificationClaim.md)

#### zkOnchainVerification

> **zkOnchainVerification**: `"NOT_CLAIMED"`

#### zkToccataL1ScriptBuilding?

> `optional` **zkToccataL1ScriptBuilding?**: `"KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0"`

***

### curve

> **curve**: `string`

Defined in: [packages/sdk/src/zk.ts:318](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L318)

***

### durationMs

> **durationMs**: `number`

Defined in: [packages/sdk/src/zk.ts:326](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L326)

***

### engine

> **engine**: `"snarkjs-bn254"`

Defined in: [packages/sdk/src/zk.ts:317](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L317)

***

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk.ts:327](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L327)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:345](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L345)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:313](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L313)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:315](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L315)

***

### proofSystem

> **proofSystem**: [`ZkProofSystem`](../type-aliases/ZkProofSystem.md)

Defined in: [packages/sdk/src/zk.ts:316](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L316)

***

### schema

> **schema**: `"hardkas.zkProofMathVerification.v1"`

Defined in: [packages/sdk/src/zk.ts:314](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L314)

***

### status

> **status**: `"ZK_GROTH16_MATH_VERIFIED"` \| `"ZK_GROTH16_MATH_VALID_UNANCHORED_VK"` \| `"ZK_GROTH16_MATH_REJECTED"` \| `"ZK_GROTH16_VERIFIER_ERROR"`

Defined in: [packages/sdk/src/zk.ts:320](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L320)

See Groth16MathVerificationOutput.status: VERIFIED needs an anchored key.

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:328](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L328)

#### binding

> **binding**: [`ZkMathBinding`](../type-aliases/ZkMathBinding.md)

#### curve

> **curve**: `string`

#### mathCheck

> **mathCheck**: `"PASS"` \| `"FAIL"` \| `"ERROR"`

#### pinnedVerificationKeyId?

> `optional` **pinnedVerificationKeyId?**: `string`

#### proofHash

> **proofHash**: `string`

#### proofSystem

> **proofSystem**: `string`

#### publicInputsHash

> **publicInputsHash**: `string`

#### publicSignals

> **publicSignals**: `string`[]

#### verificationKeyAnchor

> **verificationKeyAnchor**: [`Groth16VerificationKeyAnchor`](../type-aliases/Groth16VerificationKeyAnchor.md)

#### verificationKeyFingerprint

> **verificationKeyFingerprint**: `string`

Portable fingerprint of the key's curve points ("" when unavailable).

#### verificationKeyHash

> **verificationKeyHash**: `string`

Legacy corpus digest of the verification key object actually used ("" when it could not be read).

#### verificationKeyStrength

> **verificationKeyStrength**: [`Groth16VerificationKeyStrength`](../type-aliases/Groth16VerificationKeyStrength.md)

***

### verified

> **verified**: `boolean`

Defined in: [packages/sdk/src/zk.ts:325](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L325)
