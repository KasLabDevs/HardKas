[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / StateProvenance

# Interface: StateProvenance

Defined in: [packages/core/src/provenance.ts:8](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/provenance.ts#L8)

Explains the causal origin and validation state of a derived value.

## Properties

### authority

> **authority**: `string`

Defined in: [packages/core/src/provenance.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/provenance.ts#L12)

The architectural authority that asserts this state (e.g. "query-store projection", "filesystem artifact", "memory cache")

***

### consensusValidated

> **consensusValidated**: `boolean`

Defined in: [packages/core/src/provenance.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/provenance.ts#L37)

True if this state has been independently verified against network consensus

***

### derivedFrom?

> `optional` **derivedFrom?**: [`ArtifactId`](../type-aliases/ArtifactId.md)

Defined in: [packages/core/src/provenance.ts:17](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/provenance.ts#L17)

The source artifact ID from which this state was derived (if applicable)

***

### integrity

> **integrity**: [`IntegrityStatus`](../type-aliases/IntegrityStatus.md)

Defined in: [packages/core/src/provenance.ts:27](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/provenance.ts#L27)

Current deterministic integrity of the source

***

### originalPath?

> `optional` **originalPath?**: `string`

Defined in: [packages/core/src/provenance.ts:22](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/provenance.ts#L22)

The absolute or relative file path of the source artifact

***

### replayScope

> **replayScope**: `"unknown"` \| `"local-only"` \| `"global"`

Defined in: [packages/core/src/provenance.ts:32](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/provenance.ts#L32)

The replay scope indicating where this state is valid (e.g., "local-only", "global")
