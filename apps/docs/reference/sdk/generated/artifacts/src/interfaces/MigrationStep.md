[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / MigrationStep

# Interface: MigrationStep

Defined in: [packages/artifacts/src/migration.ts:29](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/migration.ts#L29)

A single versioned migration step that transforms an artifact payload
from one schema version to the next.

## Properties

### description

> `readonly` **description**: `string`

Defined in: [packages/artifacts/src/migration.ts:35](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/migration.ts#L35)

Human-readable description of what this migration does

***

### fromVersion

> `readonly` **fromVersion**: `string`

Defined in: [packages/artifacts/src/migration.ts:31](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/migration.ts#L31)

Source version string (e.g., "0.1.0", "1.0.0-alpha")

***

### toVersion

> `readonly` **toVersion**: `string`

Defined in: [packages/artifacts/src/migration.ts:33](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/migration.ts#L33)

Target version string

## Methods

### transform()

> **transform**(`artifact`): [`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

Defined in: [packages/artifacts/src/migration.ts:40](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/migration.ts#L40)

Transform function. Receives a shallow clone of the artifact payload
and returns the migrated payload. MUST NOT mutate the input.

#### Parameters

##### artifact

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

#### Returns

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)
