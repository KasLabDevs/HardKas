[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / EventEnvelope

# Interface: EventEnvelope\<K\>

Defined in: [packages/core/src/events.ts:149](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L149)

Formal Event Envelope (v1).

Standardizes how events are captured and tracked across the system.

## Type Parameters

### K

`K` *extends* [`EventKind`](../type-aliases/EventKind.md) = [`EventKind`](../type-aliases/EventKind.md)

## Properties

### artifactId?

> `optional` **artifactId?**: [`ArtifactId`](../type-aliases/ArtifactId.md)

Defined in: [packages/core/src/events.ts:167](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L167)

***

### causationId?

> `optional` **causationId?**: [`EventId`](../type-aliases/EventId.md)

Defined in: [packages/core/src/events.ts:165](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L165)

***

### correlationId

> **correlationId**: [`CorrelationId`](../type-aliases/CorrelationId.md)

Defined in: [packages/core/src/events.ts:164](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L164)

***

### domain

> **domain**: [`EventDomain`](../type-aliases/EventDomain.md)

Defined in: [packages/core/src/events.ts:154](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L154)

***

### emittedAt

> **emittedAt**: `string`

Defined in: [packages/core/src/events.ts:158](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L158)

***

### eventId

> **eventId**: [`EventId`](../type-aliases/EventId.md)

Defined in: [packages/core/src/events.ts:153](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L153)

***

### globalOffset?

> `optional` **globalOffset?**: `number`

Defined in: [packages/core/src/events.ts:160](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L160)

***

### kind

> **kind**: `K`

Defined in: [packages/core/src/events.ts:155](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L155)

***

### networkId

> **networkId**: `NetworkId`

Defined in: [packages/core/src/events.ts:169](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L169)

***

### payload

> **payload**: [`EventPayloadByKind`](EventPayloadByKind.md)\[`K`\]

Defined in: [packages/core/src/events.ts:171](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L171)

***

### schema

> **schema**: `"hardkas.event"`

Defined in: [packages/core/src/events.ts:150](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L150)

***

### sequenceNumber

> **sequenceNumber**: [`EventSequence`](../type-aliases/EventSequence.md)

Defined in: [packages/core/src/events.ts:159](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L159)

***

### sourceSubsystem

> **sourceSubsystem**: `string`

Defined in: [packages/core/src/events.ts:161](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L161)

***

### timestamp

> **timestamp**: `string`

Defined in: [packages/core/src/events.ts:157](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L157)

***

### txId?

> `optional` **txId?**: [`TxId`](../type-aliases/TxId.md)

Defined in: [packages/core/src/events.ts:168](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L168)

***

### version

> **version**: `"1.0.0"`

Defined in: [packages/core/src/events.ts:151](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L151)

***

### workflowId

> **workflowId**: [`WorkflowId`](../type-aliases/WorkflowId.md)

Defined in: [packages/core/src/events.ts:163](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L163)
