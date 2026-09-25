[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkProofInspectResult

# Interface: ZkProofInspectResult

Defined in: [packages/sdk/src/zk.ts:40](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L40)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:53](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L53)

#### mainnet

> **mainnet**: `"BLOCKED_BY_POLICY"`

#### vmConsensusEquivalence

> **vmConsensusEquivalence**: `"NOT_CLAIMED"`

#### zkArtifactCoherence

> **zkArtifactCoherence**: `"EXPERIMENTAL"`

#### zkLocalVerification

> **zkLocalVerification**: `"EXPERIMENTAL_FIXTURE_ONLY"`

#### zkOnchainVerification

> **zkOnchainVerification**: `"NOT_CLAIMED"`

***

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk.ts:46](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L46)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:54](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L54)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:41](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L41)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:43](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L43)

***

### proofSystem

> **proofSystem**: [`ZkProofSystem`](../type-aliases/ZkProofSystem.md)

Defined in: [packages/sdk/src/zk.ts:44](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L44)

***

### schema

> **schema**: `"hardkas.zkProofInspect.v1"`

Defined in: [packages/sdk/src/zk.ts:42](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L42)

***

### status

> **status**: `"ZK_PROOF_INSPECTED"` \| `"ZK_PROOF_INSPECT_FAILED"`

Defined in: [packages/sdk/src/zk.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L45)

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:47](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L47)

#### contentHashes

> **contentHashes**: `Record`\<`string`, `string`\>

#### expectedStatus?

> `optional` **expectedStatus?**: `string`

#### files

> **files**: `string`[]

#### verifierAdapter?

> `optional` **verifierAdapter?**: `string`
