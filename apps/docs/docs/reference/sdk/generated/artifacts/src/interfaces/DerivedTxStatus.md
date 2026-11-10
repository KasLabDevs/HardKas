[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / DerivedTxStatus

# Interface: DerivedTxStatus

Defined in: [packages/artifacts/src/tx-status.ts:92](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L92)

## Properties

### acceptingBlockHash?

> `optional` **acceptingBlockHash?**: `string`

Defined in: [packages/artifacts/src/tx-status.ts:98](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L98)

***

### confirmations?

> `optional` **confirmations?**: `object`

Defined in: [packages/artifacts/src/tx-status.ts:97](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L97)

Objective depth of the accepting block: the MINIMUM across the observers that agree on it.

#### blue

> **blue**: `string`

#### daa?

> `optional` **daa?**: `string`

#### unit

> **unit**: `"blue-score"`

***

### evidence

> **evidence**: `object`

Defined in: [packages/artifacts/src/tx-status.ts:110](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L110)

#### ignored

> **ignored**: `object`[]

#### observationArtifactIds

> **observationArtifactIds**: `string`[]

#### submissionArtifactId?

> `optional` **submissionArtifactId?**: `string`

***

### finality?

> `optional` **finality?**: `object`

Defined in: [packages/artifacts/src/tx-status.ts:99](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L99)

#### asObservedAt

> **asObservedAt**: `object`

Final according to the observed Kaspa virtual-chain finality rule at THIS observation point.

##### asObservedAt.sinkBlueScore

> **sinkBlueScore**: `string`

##### asObservedAt.sinkHash

> **sinkHash**: `string`

##### asObservedAt.virtualDaaScore

> **virtualDaaScore**: `string`

#### depth

> **depth**: `string`

#### observerId

> **observerId**: `string`

#### rule

> **rule**: `"kaspa-virtual-chain-finality"`

***

### isFinal

> **isFinal**: `boolean`

Defined in: [packages/artifacts/src/tx-status.ts:117](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L117)

Only FINALIZED is terminal for a txId.

***

### observers

> **observers**: `object`[]

Defined in: [packages/artifacts/src/tx-status.ts:109](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L109)

The observer(s) whose evidence decided; descriptions, never node identities (D-Q1.a interim).

#### description

> **description**: `string`

#### kind

> **kind**: `"rpc"` \| `"synthetic"`

#### networkId

> **networkId**: `string`

#### observerId

> **observerId**: `string`

#### serverVersion?

> `optional` **serverVersion?**: `string`

***

### perObserver

> **perObserver**: [`ObserverHistory`](ObserverHistory.md)[]

Defined in: [packages/artifacts/src/tx-status.ts:107](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L107)

Each observer's own history; the top-level status is a combination of these, never a merge of their timelines.

***

### policy

> **policy**: [`TxStatusPolicy`](TxStatusPolicy.md)

Defined in: [packages/artifacts/src/tx-status.ts:95](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L95)

***

### reasons

> **reasons**: `string`[]

Defined in: [packages/artifacts/src/tx-status.ts:115](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L115)

***

### status

> **status**: [`TxStatusKind`](../type-aliases/TxStatusKind.md)

Defined in: [packages/artifacts/src/tx-status.ts:94](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L94)

***

### txId

> **txId**: `string`

Defined in: [packages/artifacts/src/tx-status.ts:93](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L93)
