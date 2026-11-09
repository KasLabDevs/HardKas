[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkProofInspectResult

# Interface: ZkProofInspectResult

Defined in: [packages/sdk/src/zk.ts:256](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L256)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:269](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L269)

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

Defined in: [packages/sdk/src/zk.ts:262](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L262)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:270](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L270)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:257](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L257)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:259](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L259)

***

### proofSystem

> **proofSystem**: [`ZkProofSystem`](../type-aliases/ZkProofSystem.md)

Defined in: [packages/sdk/src/zk.ts:260](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L260)

***

### schema

> **schema**: `"hardkas.zkProofInspect.v1"`

Defined in: [packages/sdk/src/zk.ts:258](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L258)

***

### status

> **status**: `"ZK_PROOF_INSPECTED"` \| `"ZK_PROOF_INSPECT_FAILED"`

Defined in: [packages/sdk/src/zk.ts:261](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L261)

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:263](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L263)

#### contentHashes

> **contentHashes**: `Record`\<`string`, `string`\>

#### expectedStatus?

> `optional` **expectedStatus?**: `string`

#### files

> **files**: `string`[]

#### verifierAdapter?

> `optional` **verifierAdapter?**: `string`
