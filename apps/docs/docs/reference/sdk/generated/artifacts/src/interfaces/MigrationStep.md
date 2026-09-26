[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / MigrationStep

# Interface: MigrationStep

Defined in: [packages/artifacts/src/migration.ts:22](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L22)

A single versioned migration step that transforms an artifact payload
from one schema version to the next.

## Properties

### description

> `readonly` **description**: `string`

Defined in: [packages/artifacts/src/migration.ts:28](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L28)

Human-readable description of what this migration does

***

### fromVersion

> `readonly` **fromVersion**: `string`

Defined in: [packages/artifacts/src/migration.ts:24](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L24)

Source version string (e.g., "0.1.0", "1.0.0-alpha")

***

### toVersion

> `readonly` **toVersion**: `string`

Defined in: [packages/artifacts/src/migration.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L26)

Target version string

## Methods

### transform()

> **transform**(`artifact`): [`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

Defined in: [packages/artifacts/src/migration.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L33)

Transform function. Receives a shallow clone of the artifact payload
and returns the migrated payload. MUST NOT mutate the input.

#### Parameters

##### artifact

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

#### Returns

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)
