[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ProjectArtifactStore

# Class: ProjectArtifactStore

Defined in: [packages/artifacts/src/store.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/store.ts#L45)

## Constructors

### Constructor

> **new ProjectArtifactStore**(`workspaceRoot`): `ProjectArtifactStore`

Defined in: [packages/artifacts/src/store.ts:49](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/store.ts#L49)

#### Parameters

##### workspaceRoot

`string`

#### Returns

`ProjectArtifactStore`

## Methods

### enumerateCanonicalArtifacts()

> **enumerateCanonicalArtifacts**(): `Promise`\<`object`[]\>

Defined in: [packages/artifacts/src/store.ts:539](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/store.ts#L539)

#### Returns

`Promise`\<`object`[]\>

***

### exists()

> **exists**(`id`): `Promise`\<`boolean`\>

Defined in: [packages/artifacts/src/store.ts:101](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/store.ts#L101)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### findReceiptByTxId()

> **findReceiptByTxId**(`txId`): `Promise`\<`unknown`\>

Defined in: [packages/artifacts/src/store.ts:182](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/store.ts#L182)

Wave 10 · RECEIPT-1 · exact receipt lookup by `.txId` field.

The historical implementation delegated to `readArtifact(txId)`, which
ultimately performs a filename-substring search via
`findArtifactPathById`. That resolver keys on the artifact's own
identity token (typically `artifactId` or `contentHash`), NOT the
receipt's Kaspa consensus `.txId` field, so real-node receipts (whose
filenames encode `artifactId`, a different 64-hex string from `txId`)
silently returned `"not found in store"` even though the receipt was
present on disk. A subset of simulator receipts happened to resolve
only because their filename identity coincided with `.txId`.

The correct algorithm — already proven by
`packages/localnet/src/receipts.ts::loadSimulatedReceipt` — is:
  1. Enumerate every canonical artifact under `.hardkas/artifacts/`.
  2. Retain only those whose declared schema is an L1 receipt schema
     (`hardkas.txReceipt` or `hardkas.txReceipt.v1`) checked against
     BOTH the top-level `.schema` field AND `.schemaVersion` (some
     simulator writers set the latter instead of the former; a valid
     receipt is one that carries the schema string in either slot).
  3. Retain only those whose `.txId` is a non-empty string that
     exactly equals the requested `txId` (byte-for-byte, no
     normalisation — `txId` is contractually `z.string()` and can be
     lowercase 64-hex, a `simtx_failed_*` marker, or any deterministic
     simulator id; imposing a shape here would break legitimate
     lookups).
  4. Zero matches → `RECEIPT_NOT_FOUND` typed error.
  5. Exactly one match → return it.
  6. Multiple matches → collapse ONLY if every match carries a
     non-empty `.contentHash` string AND all values are identical
     (i.e., duplicate copies of the same evidence). Any absent /
     empty `.contentHash`, or any structural disagreement, throws
     `RECEIPT_AMBIGUOUS_CONFLICT` with the observed identities.
     This guard specifically avoids collapsing two distinct artifacts
     that both happen to omit `contentHash` under the accidental
     identity `undefined === undefined`.

The signature (`(string) => Promise<unknown>`) is preserved so the
existing sole consumer (`packages/cli/src/runners/tx-receipt-runner.ts`)
continues to work unchanged; typed errors now propagate to the CLI's
top-level renderer via Wave 8's owner-of-serialisation model.

#### Parameters

##### txId

`string`

#### Returns

`Promise`\<`unknown`\>

***

### queryArtifacts()

> **queryArtifacts**(`query`): `Promise`\<`any`[]\>

Defined in: [packages/artifacts/src/store.ts:626](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/store.ts#L626)

#### Parameters

##### query

###### schema?

`string`

#### Returns

`Promise`\<`any`[]\>

***

### readArtifact()

> **readArtifact**(`id`): `Promise`\<`unknown`\>

Defined in: [packages/artifacts/src/store.ts:105](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/store.ts#L105)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`unknown`\>

***

### resolveLineage()

> **resolveLineage**(`id`): `Promise`\<`any`[]\>

Defined in: [packages/artifacts/src/store.ts:475](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/store.ts#L475)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`any`[]\>

***

### writeArtifact()

> **writeArtifact**(`artifact`): `Promise`\<`string`\>

Defined in: [packages/artifacts/src/store.ts:74](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/store.ts#L74)

#### Parameters

##### artifact

`any`

#### Returns

`Promise`\<`string`\>
