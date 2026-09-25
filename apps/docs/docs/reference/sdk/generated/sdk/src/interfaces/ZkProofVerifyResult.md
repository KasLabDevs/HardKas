[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkProofVerifyResult

# Interface: ZkProofVerifyResult

Defined in: [packages/sdk/src/zk.ts:57](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L57)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:74](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L74)

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

Defined in: [packages/sdk/src/zk.ts:68](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L68)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:75](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L75)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:58](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L58)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:60](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L60)

***

### proofSystem

> **proofSystem**: [`ZkProofSystem`](../type-aliases/ZkProofSystem.md)

Defined in: [packages/sdk/src/zk.ts:61](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L61)

***

### schema

> **schema**: `"hardkas.zkProofVerification.v1"`

Defined in: [packages/sdk/src/zk.ts:59](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L59)

***

### status

> **status**: `"RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED"` \| `"ZK_FIXTURE_COHERENCE_PASS"` \| `"ZK_FIXTURE_COHERENCE_FAIL"` \| `"ZK_VERIFIER_UNSUPPORTED"` \| `"ZK_VERIFIER_UNAVAILABLE"`

Defined in: [packages/sdk/src/zk.ts:62](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L62)

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:69](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L69)

#### contentHashes

> **contentHashes**: `"PASS"` \| `"FAIL"`

#### localVerification

> **localVerification**: `"PASS"` \| `"FAIL"` \| `"NOT_IMPLEMENTED"`

#### verifierAdapter?

> `optional` **verifierAdapter?**: `string`
