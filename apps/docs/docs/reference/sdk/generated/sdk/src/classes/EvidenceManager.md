[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EvidenceManager

# Class: EvidenceManager

Defined in: [packages/sdk/src/evidence.ts:166](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/evidence.ts#L166)

## Constructors

### Constructor

> **new EvidenceManager**(): `EvidenceManager`

#### Returns

`EvidenceManager`

## Methods

### explain()

> `static` **explain**(`packagePath`): `Promise`\<`string`\>

Defined in: [packages/sdk/src/evidence.ts:417](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/evidence.ts#L417)

Explains an Evidence Package V1

#### Parameters

##### packagePath

`string`

#### Returns

`Promise`\<`string`\>

***

### pack()

> `static` **pack**(`options`): `Promise`\<`string`\>

Defined in: [packages/sdk/src/evidence.ts:171](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/evidence.ts#L171)

Packs a Scenario Result into a verifiable Evidence Package V1. The package is verified before it is written: a
package that would not verify (e.g. a payment claim whose lineage does not close) is refused, never written.

#### Parameters

##### options

[`EvidencePackOptions`](../interfaces/EvidencePackOptions.md)

#### Returns

`Promise`\<`string`\>

***

### verify()

> `static` **verify**(`packagePath`): `Promise`\<[`EvidenceVerifyResult`](../interfaces/EvidenceVerifyResult.md)\>

Defined in: [packages/sdk/src/evidence.ts:263](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/evidence.ts#L263)

Verifies an Evidence Package V1

#### Parameters

##### packagePath

`string`

#### Returns

`Promise`\<[`EvidenceVerifyResult`](../interfaces/EvidenceVerifyResult.md)\>

***

### verifyPackage()

> `static` **verifyPackage**(`pkg`): `Promise`\<[`EvidenceVerifyResult`](../interfaces/EvidenceVerifyResult.md)\>

Defined in: [packages/sdk/src/evidence.ts:273](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/evidence.ts#L273)

Verifies a package already in memory (what `verify` reads, what `pack` is about to write).

#### Parameters

##### pkg

###### artifactDiscovery?

\{ `source`: `string`; \}

###### artifactDiscovery.source

`string`

###### artifacts

`any`[]

###### assumptionLevel?

`string`

###### claims

\{ `bridgeReady?`: `boolean`; `mainnet`: `boolean`; `onchainZk?`: `boolean`; `production`: `boolean`; `testnet`: `boolean`; \}

###### claims.bridgeReady?

`boolean`

###### claims.mainnet

`boolean`

###### claims.onchainZk?

`boolean`

###### claims.production

`boolean`

###### claims.testnet

`boolean`

###### contentHash?

`string`

###### createdAt

`string`

###### hardkasVersion

`string`

###### hashes

`Record`\<`string`, `string`\>

###### hashVersion?

`string` \| `number`

###### lineage?

\{ `artifactId`: `string`; `lineageId?`: `string`; `parentArtifactId?`: `string`; `rootArtifactId?`: `string`; `sequence?`: `number`; \}

###### lineage.artifactId

`string`

###### lineage.lineageId?

`string`

###### lineage.parentArtifactId?

`string`

###### lineage.rootArtifactId?

`string`

###### lineage.sequence?

`number`

###### lineageDepth?

`number`

###### metadata?

`any`

###### mode

`"rpc"` \| `"simulator"` \| `"localnet"`

###### name

`string`

###### networkId

`"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

###### parents?

`string`[]

###### scenarioResult?

`any`

###### schema

`"hardkas.evidencePackage.v1"`

###### schemaVersion?

`string`

###### scriptCapabilities?

(`"p2pk"` \| `"multisig"` \| `"timelock"` \| `"covenant-experimental"` \| `"silverscript-experimental"` \| `"tockata-experimental"`)[]

###### scriptMetadata?

\{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}

###### scriptMetadata.consensusImpact?

`"experimental"` \| `"none"`

###### scriptMetadata.experimental

`boolean`

###### scriptMetadata.language?

`"native"` \| `"silverscript"` \| `"tockata"`

###### scriptMetadata.notes?

`string`[]

###### scriptMetadata.version?

`string`

###### scriptProfile?

`"standard"` \| `"experimental"`

###### version

`"1.0.0-alpha"`

###### workflowId?

`string`

#### Returns

`Promise`\<[`EvidenceVerifyResult`](../interfaces/EvidenceVerifyResult.md)\>
