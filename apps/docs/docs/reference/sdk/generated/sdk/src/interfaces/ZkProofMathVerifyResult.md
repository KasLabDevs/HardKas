[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkProofMathVerifyResult

# Interface: ZkProofMathVerifyResult

Defined in: [packages/sdk/src/zk.ts:303](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L303)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:335](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L335)

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

Defined in: [packages/sdk/src/zk.ts:309](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L309)

***

### durationMs

> **durationMs**: `number`

Defined in: [packages/sdk/src/zk.ts:317](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L317)

***

### engine

> **engine**: `"snarkjs-bn254"`

Defined in: [packages/sdk/src/zk.ts:308](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L308)

***

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk.ts:318](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L318)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:336](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L336)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:304](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L304)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:306](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L306)

***

### proofSystem

> **proofSystem**: [`ZkProofSystem`](../type-aliases/ZkProofSystem.md)

Defined in: [packages/sdk/src/zk.ts:307](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L307)

***

### schema

> **schema**: `"hardkas.zkProofMathVerification.v1"`

Defined in: [packages/sdk/src/zk.ts:305](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L305)

***

### status

> **status**: `"ZK_GROTH16_MATH_VERIFIED"` \| `"ZK_GROTH16_MATH_VALID_UNANCHORED_VK"` \| `"ZK_GROTH16_MATH_REJECTED"` \| `"ZK_GROTH16_VERIFIER_ERROR"`

Defined in: [packages/sdk/src/zk.ts:311](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L311)

See Groth16MathVerificationOutput.status: VERIFIED needs an anchored key.

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:319](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L319)

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

Defined in: [packages/sdk/src/zk.ts:316](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L316)
