[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / EvidenceBatchExporter

# Class: EvidenceBatchExporter

Defined in: [packages/artifacts/src/evidence-batch.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/evidence-batch.ts#L26)

Groups multiple local artifacts into a single export batch for external consumption.
Does not replace the EvidencePackage concept, just facilitates its grouping.

## Constructors

### Constructor

> **new EvidenceBatchExporter**(`indexStore`): `EvidenceBatchExporter`

Defined in: [packages/artifacts/src/evidence-batch.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/evidence-batch.ts#L29)

#### Parameters

##### indexStore

[`ArtifactIndexStoreJson`](ArtifactIndexStoreJson.md)

#### Returns

`EvidenceBatchExporter`

## Methods

### export()

> **export**(`options`): `string`

Defined in: [packages/artifacts/src/evidence-batch.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/evidence-batch.ts#L33)

#### Parameters

##### options

[`EvidenceBatchExportOptions`](../interfaces/EvidenceBatchExportOptions.md)

#### Returns

`string`

***

### exportFromIndex()

> **exportFromIndex**(`options`): `string`

Defined in: [packages/artifacts/src/evidence-batch.ts:55](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/evidence-batch.ts#L55)

#### Parameters

##### options

[`EvidenceBatchExportFromIndexOptions`](../interfaces/EvidenceBatchExportFromIndexOptions.md)

#### Returns

`string`
