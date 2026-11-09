[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / createCovenantTransitionFactArtifact

# Function: createCovenantTransitionFactArtifact()

> **createCovenantTransitionFactArtifact**(`options`): `object`

Defined in: [packages/artifacts/dist/index.d.ts:14382](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L14382)

## Parameters

### options

`CreateCovenantTransitionFactOptions`

## Returns

`object`

### artifactSha256

> **artifactSha256**: `string`

### contentHash?

> `optional` **contentHash?**: `string`

### contractName

> **contractName**: `string`

### covenantId

> **covenantId**: `string`

### draftArtifactId?

> `optional` **draftArtifactId?**: `string`

### entrypoint

> **entrypoint**: `string`

### hardkasVersion

> **hardkasVersion**: `string`

### hashVersion

> **hashVersion**: `string` \| `number`

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

### nextState?

> `optional` **nextState?**: `Record`\<`string`, `unknown`\>

### planArtifactId

> **planArtifactId**: `string`

### policy?

> `optional` **policy?**: `string`

### previousState?

> `optional` **previousState?**: `Record`\<`string`, `unknown`\>

### schema

> **schema**: `"hardkas.covenantTransitionFact.v1"`

### spentOutpoint

> **spentOutpoint**: `object`

#### spentOutpoint.index

> **index**: `number`

#### spentOutpoint.transactionId

> **transactionId**: `string`

### successorAmountSompi?

> `optional` **successorAmountSompi?**: `string`

### successorOutpoint?

> `optional` **successorOutpoint?**: `object`

#### successorOutpoint.index

> **index**: `number`

#### successorOutpoint.transactionId

> **transactionId**: `string`

### timestamp

> **timestamp**: `string`

### txId

> **txId**: `string`

### validation

> **validation**: `object`

#### validation.diagnostic?

> `optional` **diagnostic?**: `string`

#### validation.scriptVmPassed?

> `optional` **scriptVmPassed?**: `boolean`

#### validation.structuralPassed

> **structuralPassed**: `boolean`

#### validation.vmStatus?

> `optional` **vmStatus?**: `string`
