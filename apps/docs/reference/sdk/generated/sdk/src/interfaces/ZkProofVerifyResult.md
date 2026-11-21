[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkProofVerifyResult

# Interface: ZkProofVerifyResult

Defined in: [packages/sdk/src/zk.ts:282](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L282)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:299](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L299)

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

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk.ts:293](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L293)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:300](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L300)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:283](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L283)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:285](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L285)

***

### proofSystem

> **proofSystem**: [`ZkProofSystem`](../type-aliases/ZkProofSystem.md)

Defined in: [packages/sdk/src/zk.ts:286](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L286)

***

### schema

> **schema**: `"hardkas.zkProofVerification.v1"`

Defined in: [packages/sdk/src/zk.ts:284](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L284)

***

### status

> **status**: `"RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED"` \| `"ZK_FIXTURE_COHERENCE_PASS"` \| `"ZK_FIXTURE_COHERENCE_FAIL"` \| `"ZK_VERIFIER_UNSUPPORTED"` \| `"ZK_VERIFIER_UNAVAILABLE"`

Defined in: [packages/sdk/src/zk.ts:287](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L287)

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:294](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L294)

#### contentHashes

> **contentHashes**: `"PASS"` \| `"FAIL"`

#### localVerification

> **localVerification**: `"PASS"` \| `"FAIL"` \| `"NOT_IMPLEMENTED"`

#### verifierAdapter?

> `optional` **verifierAdapter?**: `string`
