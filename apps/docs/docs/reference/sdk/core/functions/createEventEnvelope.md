[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / createEventEnvelope

# Function: createEventEnvelope()

> **createEventEnvelope**\<`K`\>(`params`): [`EventEnvelope`](../interfaces/EventEnvelope.md)\<`K`\>

Defined in: [packages/core/src/events.ts:236](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L236)

Creates a formal event envelope with required metadata.

## Type Parameters

### K

`K` *extends* [`EventKind`](../type-aliases/EventKind.md)

## Parameters

### params

#### artifactId?

[`ArtifactId`](../type-aliases/ArtifactId.md)

#### causationId?

[`EventId`](../type-aliases/EventId.md)

#### correlationId

[`CorrelationId`](../type-aliases/CorrelationId.md)

#### domain

[`EventDomain`](../type-aliases/EventDomain.md)

#### eventId?

[`EventId`](../type-aliases/EventId.md)

#### globalOffset?

`number`

#### kind

`K`

#### networkId

`NetworkId`

#### payload

[`EventPayloadByKind`](../interfaces/EventPayloadByKind.md)\[`K`\]

#### sequenceNumber

[`EventSequence`](../type-aliases/EventSequence.md)

#### sourceSubsystem

`string`

#### txId?

[`TxId`](../type-aliases/TxId.md)

#### workflowId

[`WorkflowId`](../type-aliases/WorkflowId.md)

## Returns

[`EventEnvelope`](../interfaces/EventEnvelope.md)\<`K`\>
