[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ArtifactSchemaValidationStatus

# Type Alias: ArtifactSchemaValidationStatus

> **ArtifactSchemaValidationStatus** = `"VALID"` \| `"INVALID"` \| `"NOT_VALIDATED"`

Defined in: [packages/artifacts/src/verify.ts:256](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L256)

VALID / INVALID: the artifact was parsed with its registered schema. NOT_VALIDATED: the registry has no schema for
its schema name (or it is not an object), so nothing was checked.
