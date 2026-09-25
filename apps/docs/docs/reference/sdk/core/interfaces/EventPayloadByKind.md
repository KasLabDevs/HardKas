[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / EventPayloadByKind

# Interface: EventPayloadByKind

Defined in: [packages/core/src/events.ts:75](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L75)

Payload mapping for each event kind.

## Properties

### artifact.corrupted

> **artifact.corrupted**: `object`

Defined in: [packages/core/src/events.ts:126](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L126)

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### issue

> **issue**: `string`

#### path

> **path**: `string`

***

### artifact.indexed

> **artifact.indexed**: `object`

Defined in: [packages/core/src/events.ts:125](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L125)

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### schema

> **schema**: `string`

***

### artifact.written

> **artifact.written**: `object`

Defined in: [packages/core/src/events.ts:124](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L124)

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### path

> **path**: `string`

***

### dag.conflict

> **dag.conflict**: `object`

Defined in: [packages/core/src/events.ts:103](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L103)

#### losers

> **losers**: [`TxId`](../type-aliases/TxId.md)[]

#### outpoint

> **outpoint**: `string`

#### winner

> **winner**: [`TxId`](../type-aliases/TxId.md)

***

### dag.displacement

> **dag.displacement**: `object`

Defined in: [packages/core/src/events.ts:104](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L104)

#### displacedBy

> **displacedBy**: [`TxId`](../type-aliases/TxId.md)

#### txId

> **txId**: [`TxId`](../type-aliases/TxId.md)

***

### dag.sink\_moved

> **dag.sink\_moved**: `object`

Defined in: [packages/core/src/events.ts:105](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L105)

#### daaScore

> **daaScore**: [`DaaScore`](../type-aliases/DaaScore.md)

#### newSink

> **newSink**: `string`

#### oldSink

> **oldSink**: `string`

***

### dashboard.cache\_invalidated

> **dashboard.cache\_invalidated**: `object`

Defined in: [packages/core/src/events.ts:135](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L135)

#### key

> **key**: `string`

***

### dashboard.refetch\_completed

> **dashboard.refetch\_completed**: `object`

Defined in: [packages/core/src/events.ts:137](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L137)

#### key

> **key**: `string`

#### success

> **success**: `boolean`

***

### dashboard.refetch\_started

> **dashboard.refetch\_started**: `object`

Defined in: [packages/core/src/events.ts:136](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L136)

#### key

> **key**: `string`

***

### integrity.hash\_mismatch

> **integrity.hash\_mismatch**: `object`

Defined in: [packages/core/src/events.ts:92](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L92)

#### actual

> **actual**: `string`

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### expected

> **expected**: `string`

***

### integrity.lineage\_break

> **integrity.lineage\_break**: `object`

Defined in: [packages/core/src/events.ts:94](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L94)

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### lineageId

> **lineageId**: [`LineageId`](../type-aliases/LineageId.md)

***

### integrity.schema\_violation

> **integrity.schema\_violation**: `object`

Defined in: [packages/core/src/events.ts:93](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L93)

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### details

> **details**: `string`

***

### integrity.violation

> **integrity.violation**: `object`

Defined in: [packages/core/src/events.ts:95](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L95)

#### message

> **message**: `string`

#### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

#### severity

> **severity**: `string`

#### sourceEventId?

> `optional` **sourceEventId?**: `string`

#### violationCode

> **violationCode**: `string`

***

### l2.deposit.planned

> **l2.deposit.planned**: `object`

Defined in: [packages/core/src/events.ts:121](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L121)

#### amount

> **amount**: `bigint`

#### asset

> **asset**: `string`

#### to

> **to**: `string`

***

### l2.withdrawal.planned

> **l2.withdrawal.planned**: `object`

Defined in: [packages/core/src/events.ts:122](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L122)

#### amount

> **amount**: `bigint`

#### asset

> **asset**: `string`

#### from

> **from**: `string`

***

### lineage.verification\_failed

> **lineage.verification\_failed**: `object`

Defined in: [packages/core/src/events.ts:141](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L141)

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### missingParentId

> **missingParentId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

***

### localnet.started

> **localnet.started**: `object`

Defined in: [packages/core/src/events.ts:118](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L118)

#### mode

> **mode**: `string`

#### networkId

> **networkId**: `NetworkId`

***

### localnet.stopped

> **localnet.stopped**: `object`

Defined in: [packages/core/src/events.ts:119](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L119)

#### reason

> **reason**: `string`

***

### query\_store.sync\_completed

> **query\_store.sync\_completed**: `object`

Defined in: [packages/core/src/events.ts:140](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L140)

#### stats

> **stats**: `Record`\<`string`, `number`\>

#### syncId

> **syncId**: `string`

***

### query\_store.sync\_started

> **query\_store.sync\_started**: `object`

Defined in: [packages/core/src/events.ts:139](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L139)

#### syncId

> **syncId**: `string`

***

### replay.completed

> **replay.completed**: `object`

Defined in: [packages/core/src/events.ts:130](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L130)

#### success

> **success**: `boolean`

#### targetArtifactId

> **targetArtifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

***

### replay.divergence

> **replay.divergence**: `object`

Defined in: [packages/core/src/events.ts:115](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L115)

#### actual

> **actual**: `string`

#### expected

> **expected**: `string`

#### field

> **field**: `string`

#### txId

> **txId**: [`TxId`](../type-aliases/TxId.md)

***

### replay.excluded

> **replay.excluded**: `object`

Defined in: [packages/core/src/events.ts:131](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L131)

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### reason

> **reason**: `string`

***

### replay.invalidated

> **replay.invalidated**: `object`

Defined in: [packages/core/src/events.ts:129](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L129)

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### reason

> **reason**: `string`

***

### replay.verified

> **replay.verified**: `object`

Defined in: [packages/core/src/events.ts:116](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L116)

#### lineageId

> **lineageId**: [`LineageId`](../type-aliases/LineageId.md)

#### txId

> **txId**: [`TxId`](../type-aliases/TxId.md)

***

### rpc.error

> **rpc.error**: `object`

Defined in: [packages/core/src/events.ts:108](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L108)

#### endpoint

> **endpoint**: [`RpcEndpointId`](../type-aliases/RpcEndpointId.md)

#### error

> **error**: `string`

#### retriable

> **retriable**: `boolean`

***

### rpc.health

> **rpc.health**: `object`

Defined in: [packages/core/src/events.ts:107](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L107)

#### endpoint

> **endpoint**: [`RpcEndpointId`](../type-aliases/RpcEndpointId.md)

#### latencyMs

> **latencyMs**: `number`

#### state

> **state**: `string`

***

### rpc.stale

> **rpc.stale**: `object`

Defined in: [packages/core/src/events.ts:109](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L109)

#### currentDaaScore

> **currentDaaScore**: [`DaaScore`](../type-aliases/DaaScore.md)

#### endpoint

> **endpoint**: [`RpcEndpointId`](../type-aliases/RpcEndpointId.md)

#### lastDaaScore

> **lastDaaScore**: [`DaaScore`](../type-aliases/DaaScore.md)

***

### sqlite.commit

> **sqlite.commit**: `object`

Defined in: [packages/core/src/events.ts:127](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L127)

#### rowCount

> **rowCount**: `number`

#### transactionId

> **transactionId**: `string`

***

### sse.emitted

> **sse.emitted**: `object`

Defined in: [packages/core/src/events.ts:133](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L133)

#### channel

> **channel**: `string`

#### eventId

> **eventId**: [`EventId`](../type-aliases/EventId.md)

***

### workflow.completed

> **workflow.completed**: `object`

Defined in: [packages/core/src/events.ts:89](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L89)

#### workflowId

> **workflowId**: [`WorkflowId`](../type-aliases/WorkflowId.md)

***

### workflow.failed

> **workflow.failed**: `object`

Defined in: [packages/core/src/events.ts:90](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L90)

#### error

> **error**: `string`

#### workflowId

> **workflowId**: [`WorkflowId`](../type-aliases/WorkflowId.md)

***

### workflow.plan.created

> **workflow.plan.created**: `object`

Defined in: [packages/core/src/events.ts:76](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L76)

#### amountSompi

> **amountSompi**: `bigint`

#### network

> **network**: `NetworkId`

#### planId

> **planId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

***

### workflow.receipt

> **workflow.receipt**: `object`

Defined in: [packages/core/src/events.ts:83](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L83)

#### daaScore?

> `optional` **daaScore?**: [`DaaScore`](../type-aliases/DaaScore.md)

#### status

> **status**: `"accepted"` \| `"finalized"` \| `"failed"`

#### txId

> **txId**: [`TxId`](../type-aliases/TxId.md)

***

### workflow.signed

> **workflow.signed**: `object`

Defined in: [packages/core/src/events.ts:81](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L81)

#### planId

> **planId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### signedId

> **signedId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### txId?

> `optional` **txId?**: [`TxId`](../type-aliases/TxId.md)

***

### workflow.started

> **workflow.started**: `object`

Defined in: [packages/core/src/events.ts:88](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L88)

#### network

> **network**: `NetworkId`

#### workflowId

> **workflowId**: [`WorkflowId`](../type-aliases/WorkflowId.md)

***

### workflow.submitted

> **workflow.submitted**: `object`

Defined in: [packages/core/src/events.ts:82](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L82)

#### rpcUrl

> **rpcUrl**: `string`

#### txId

> **txId**: [`TxId`](../type-aliases/TxId.md)
