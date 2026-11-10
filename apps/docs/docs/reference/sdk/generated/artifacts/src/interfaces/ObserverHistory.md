[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ObserverHistory

# Interface: ObserverHistory

Defined in: [packages/artifacts/src/tx-status.ts:81](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L81)

## Properties

### acceptingBlockHash?

> `optional` **acceptingBlockHash?**: `string`

Defined in: [packages/artifacts/src/tx-status.ts:84](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L84)

***

### confirmations?

> `optional` **confirmations?**: `object`

Defined in: [packages/artifacts/src/tx-status.ts:85](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L85)

#### blue

> **blue**: `string`

#### daa?

> `optional` **daa?**: `string`

#### unit

> **unit**: `"blue-score"`

***

### finality?

> `optional` **finality?**: `object`

Defined in: [packages/artifacts/src/tx-status.ts:86](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L86)

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

### latestPoint

> **latestPoint**: `object`

Defined in: [packages/artifacts/src/tx-status.ts:87](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L87)

#### sinkBlueScore

> **sinkBlueScore**: `string`

#### sinkHash

> **sinkHash**: `string`

#### virtualDaaScore

> **virtualDaaScore**: `string`

***

### observationArtifactIds

> **observationArtifactIds**: `string`[]

Defined in: [packages/artifacts/src/tx-status.ts:88](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L88)

***

### observerId

> **observerId**: `string`

Defined in: [packages/artifacts/src/tx-status.ts:82](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L82)

***

### reasons

> **reasons**: `string`[]

Defined in: [packages/artifacts/src/tx-status.ts:89](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L89)

***

### status

> **status**: [`ObserverHistoryStatus`](../type-aliases/ObserverHistoryStatus.md)

Defined in: [packages/artifacts/src/tx-status.ts:83](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-status.ts#L83)
