[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ZkCorpusVerifyResult

# Interface: ZkCorpusVerifyResult

Defined in: [packages/sdk/src/zk.ts:348](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L348)

## Properties

### claims

> **claims**: `object`

Defined in: [packages/sdk/src/zk.ts:364](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L364)

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

Defined in: [packages/sdk/src/zk.ts:352](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L352)

***

### issues

> **issues**: [`ZkIssue`](ZkIssue.md)[]

Defined in: [packages/sdk/src/zk.ts:372](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L372)

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/zk.ts:349](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L349)

***

### path

> **path**: `string`

Defined in: [packages/sdk/src/zk.ts:351](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L351)

***

### schema

> **schema**: `"hardkas.zkCorpusVerification.v1"`

Defined in: [packages/sdk/src/zk.ts:350](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L350)

***

### status

> **status**: `"ZK_CORPUS_VERIFICATION_PASS"` \| `"ZK_CORPUS_VERIFICATION_FAIL"`

Defined in: [packages/sdk/src/zk.ts:353](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L353)

***

### summary

> **summary**: `object`

Defined in: [packages/sdk/src/zk.ts:354](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk.ts#L354)

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
