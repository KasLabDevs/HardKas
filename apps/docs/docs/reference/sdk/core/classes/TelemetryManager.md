[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / TelemetryManager

# Class: TelemetryManager

Defined in: [packages/core/src/telemetry.ts:43](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/telemetry.ts#L43)

## Constructors

### Constructor

> **new TelemetryManager**(`rootDir?`): `TelemetryManager`

Defined in: [packages/core/src/telemetry.ts:50](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/telemetry.ts#L50)

#### Parameters

##### rootDir?

`string`

#### Returns

`TelemetryManager`

## Methods

### clearContext()

> **clearContext**(): `void`

Defined in: [packages/core/src/telemetry.ts:62](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/telemetry.ts#L62)

#### Returns

`void`

***

### getContext()

> **getContext**(): `object`

Defined in: [packages/core/src/telemetry.ts:66](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/telemetry.ts#L66)

#### Returns

`object`

##### bucket?

> `optional` **bucket?**: `string`

##### caseId?

> `optional` **caseId?**: `string`

##### seed?

> `optional` **seed?**: `number`

***

### init()

> **init**(`rootDir`): `void`

Defined in: [packages/core/src/telemetry.ts:54](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/telemetry.ts#L54)

#### Parameters

##### rootDir

`string`

#### Returns

`void`

***

### logAnomaly()

> **logAnomaly**(`anomalyType`, `severity`, `subsystem`, `details`, `sandboxOverride?`): `void`

Defined in: [packages/core/src/telemetry.ts:70](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/telemetry.ts#L70)

#### Parameters

##### anomalyType

[`AnomalyType`](../type-aliases/AnomalyType.md)

##### severity

[`Severity`](../type-aliases/Severity.md)

##### subsystem

[`TelemetrySubsystem`](../type-aliases/TelemetrySubsystem.md)

##### details

`string`

##### sandboxOverride?

`string`

#### Returns

`void`

***

### setContext()

> **setContext**(`context`): `void`

Defined in: [packages/core/src/telemetry.ts:58](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/telemetry.ts#L58)

#### Parameters

##### context

###### bucket?

`string`

###### caseId?

`string`

###### seed?

`number`

#### Returns

`void`

***

### shouldPreserveSandbox()

> **shouldPreserveSandbox**(`sandboxDir`): `boolean`

Defined in: [packages/core/src/telemetry.ts:158](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/telemetry.ts#L158)

#### Parameters

##### sandboxDir

`string`

#### Returns

`boolean`
