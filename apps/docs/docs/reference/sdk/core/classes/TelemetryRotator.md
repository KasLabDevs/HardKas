[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / TelemetryRotator

# Class: TelemetryRotator

Defined in: [packages/core/src/retention.ts:11](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/retention.ts#L11)

## Constructors

### Constructor

> **new TelemetryRotator**(): `TelemetryRotator`

#### Returns

`TelemetryRotator`

## Methods

### forceRotate()

> `static` **forceRotate**(`rootDir`): [`RotationResult`](../interfaces/RotationResult.md)

Defined in: [packages/core/src/retention.ts:43](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/retention.ts#L43)

Forces a rotation regardless of file size.

#### Parameters

##### rootDir

`string`

#### Returns

[`RotationResult`](../interfaces/RotationResult.md)

***

### listArchivedSegments()

> `static` **listArchivedSegments**(`rootDir`): `string`[]

Defined in: [packages/core/src/retention.ts:76](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/retention.ts#L76)

Lists all archived telemetry segments.

#### Parameters

##### rootDir

`string`

#### Returns

`string`[]

***

### rotateIfNeeded()

> `static` **rotateIfNeeded**(`rootDir`, `maxSizeBytes?`): [`RotationResult`](../interfaces/RotationResult.md)

Defined in: [packages/core/src/retention.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/retention.ts#L18)

Rotates the telemetry stream if it exceeds the maximum size.
This is a safe operation that renames the active file to an archive directory.

#### Parameters

##### rootDir

`string`

##### maxSizeBytes?

`number` = `...`

#### Returns

[`RotationResult`](../interfaces/RotationResult.md)
