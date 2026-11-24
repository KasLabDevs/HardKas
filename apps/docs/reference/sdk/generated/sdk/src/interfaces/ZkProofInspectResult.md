[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkProofInspectResult

# Interface: ZkProofInspectResult

Defined in: [packages/sdk/src/zk.ts:265](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L265)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:278](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L278)

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

Defined in: [packages/sdk/src/zk.ts:271](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L271)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:279](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L279)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:266](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L266)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:268](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L268)

***

### proofSystem

> **proofSystem**: [`ZkProofSystem`](../type-aliases/ZkProofSystem.md)

Defined in: [packages/sdk/src/zk.ts:269](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L269)

***

### schema

> **schema**: `"hardkas.zkProofInspect.v1"`

Defined in: [packages/sdk/src/zk.ts:267](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L267)

***

### status

> **status**: `"ZK_PROOF_INSPECTED"` \| `"ZK_PROOF_INSPECT_FAILED"`

Defined in: [packages/sdk/src/zk.ts:270](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L270)

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:272](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L272)

#### contentHashes

> **contentHashes**: `Record`\<`string`, `string`\>

#### expectedStatus?

> `optional` **expectedStatus?**: `string`

#### files

> **files**: `string`[]

#### verifierAdapter?

> `optional` **verifierAdapter?**: `string`
