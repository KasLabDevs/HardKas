[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkProofVerifyResult

# Interface: ZkProofVerifyResult

Defined in: [packages/sdk/src/zk.ts:273](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L273)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:290](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L290)

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

Defined in: [packages/sdk/src/zk.ts:284](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L284)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:291](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L291)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:274](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L274)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:276](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L276)

***

### proofSystem

> **proofSystem**: [`ZkProofSystem`](../type-aliases/ZkProofSystem.md)

Defined in: [packages/sdk/src/zk.ts:277](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L277)

***

### schema

> **schema**: `"hardkas.zkProofVerification.v1"`

Defined in: [packages/sdk/src/zk.ts:275](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L275)

***

### status

> **status**: `"RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED"` \| `"ZK_FIXTURE_COHERENCE_PASS"` \| `"ZK_FIXTURE_COHERENCE_FAIL"` \| `"ZK_VERIFIER_UNSUPPORTED"` \| `"ZK_VERIFIER_UNAVAILABLE"`

Defined in: [packages/sdk/src/zk.ts:278](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L278)

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:285](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L285)

#### contentHashes

> **contentHashes**: `"PASS"` \| `"FAIL"`

#### localVerification

> **localVerification**: `"PASS"` \| `"FAIL"` \| `"NOT_IMPLEMENTED"`

#### verifierAdapter?

> `optional` **verifierAdapter?**: `string`
