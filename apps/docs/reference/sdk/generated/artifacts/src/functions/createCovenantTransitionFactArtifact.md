[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createCovenantTransitionFactArtifact

# Function: createCovenantTransitionFactArtifact()

> **createCovenantTransitionFactArtifact**(`options`): `object`

Defined in: [packages/artifacts/src/covenant-fact.ts:31](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/covenant-fact.ts#L31)

## Parameters

### options

[`CreateCovenantTransitionFactOptions`](../interfaces/CreateCovenantTransitionFactOptions.md)

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

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

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
