[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / AppendCoordinator

# Class: AppendCoordinator

Defined in: [packages/core/src/append-coordinator.ts:5](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/append-coordinator.ts#L5)

## Constructors

### Constructor

> **new AppendCoordinator**(): `AppendCoordinator`

#### Returns

`AppendCoordinator`

## Methods

### appendAtomic()

> `static` **appendAtomic**(`filePath`, `line`, `rootDir`): `void`

Defined in: [packages/core/src/append-coordinator.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/append-coordinator.ts#L12)

Safely appends a line to a JSONL log under process coordination locks.
Performs an immediate fsync to ensure data durability.
Also repairs the trailing line if it is corrupted, emitting an anomaly.

#### Parameters

##### filePath

`string`

##### line

`string`

##### rootDir

`string`

#### Returns

`void`

***

### recoverCorruptedTail()

> `static` **recoverCorruptedTail**(`filePath`): `object`

Defined in: [packages/core/src/append-coordinator.ts:119](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/append-coordinator.ts#L119)

Scans a JSONL stream for corruption, truncating malformed trailing lines.
Utilizes a backward newline scanning logic with a rolling buffer,
supporting lines of arbitrary size and only truncating the last complete
valid JSONL boundary if a parse failure is detected.

#### Parameters

##### filePath

`string`

#### Returns

`object`

##### linesDiscarded

> **linesDiscarded**: `number`

##### originalSize

> **originalSize**: `number`

##### originalTail

> **originalTail**: `string`

##### reason

> **reason**: `string`

##### recoveredSize

> **recoveredSize**: `number`

##### repaired

> **repaired**: `boolean`
