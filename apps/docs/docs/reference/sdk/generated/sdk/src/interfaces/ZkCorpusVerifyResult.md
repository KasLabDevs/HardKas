[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkCorpusVerifyResult

# Interface: ZkCorpusVerifyResult

Defined in: [packages/sdk/src/zk.ts:339](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L339)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:355](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L355)

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

Defined in: [packages/sdk/src/zk.ts:343](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L343)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:363](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L363)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:340](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L340)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:342](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L342)

***

### schema

> **schema**: `"hardkas.zkCorpusVerification.v1"`

Defined in: [packages/sdk/src/zk.ts:341](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L341)

***

### status

> **status**: `"ZK_CORPUS_VERIFICATION_PASS"` \| `"ZK_CORPUS_VERIFICATION_FAIL"`

Defined in: [packages/sdk/src/zk.ts:344](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L344)

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:345](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk.ts#L345)

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

#### mathChecked

> **mathChecked**: `number`

Fixtures whose cryptographic claim was exercised with the pairing check.

#### proofSystems

> **proofSystems**: `string`[]
