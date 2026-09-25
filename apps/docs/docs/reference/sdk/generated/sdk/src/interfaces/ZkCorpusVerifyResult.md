[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkCorpusVerifyResult

# Interface: ZkCorpusVerifyResult

Defined in: [packages/sdk/src/zk.ts:78](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L78)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:92](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L92)

#### mainnet

> **mainnet**: `"BLOCKED_BY_POLICY"` \| `"INVALID"`

#### runtimeOutcome

> **runtimeOutcome**: `"PARTIAL"` \| `"INVALID"`

#### vmConsensusEquivalence

> **vmConsensusEquivalence**: `"NOT_CLAIMED"` \| `"INVALID"`

#### zkArtifactCoherence

> **zkArtifactCoherence**: `"READY_MATCH"` \| `"INVALID"`

#### zkLocalVerification

> **zkLocalVerification**: `"READY_GROTH16_FIXTURE_COHERENCE"` \| `"INVALID"`

#### zkOnchainVerification

> **zkOnchainVerification**: `"NOT_CLAIMED"` \| `"INVALID"`

***

### experimental

> **experimental**: `true`

Defined in: [packages/sdk/src/zk.ts:82](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L82)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:100](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L100)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:79](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L79)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:81](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L81)

***

### schema

> **schema**: `"hardkas.zkCorpusVerification.v1"`

Defined in: [packages/sdk/src/zk.ts:80](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L80)

***

### status

> **status**: `"ZK_CORPUS_VERIFICATION_PASS"` \| `"ZK_CORPUS_VERIFICATION_FAIL"`

Defined in: [packages/sdk/src/zk.ts:83](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L83)

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:84](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L84)

#### artifactsChecked

> **artifactsChecked**: `number`

#### contentHashes

> **contentHashes**: `"PASS"` \| `"FAIL"`

#### fixturesChecked

> **fixturesChecked**: `number`

#### knownLimitations

> **knownLimitations**: `string`[]

#### localVerification

> **localVerification**: `"PASS"` \| `"FAIL"` \| `"PARTIAL"`

#### proofSystems

> **proofSystems**: `string`[]
