[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createCovenantTransitionFactArtifact

# Function: createCovenantTransitionFactArtifact()

> **createCovenantTransitionFactArtifact**(`options`): `object`

Defined in: [packages/artifacts/src/covenant-fact.ts:31](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/covenant-fact.ts#L31)

## Parameters

### options

[`CreateCovenantTransitionFactOptions`](../interfaces/CreateCovenantTransitionFactOptions.md)

## Returns

`object`

### artifactSha256?

> `optional` **artifactSha256?**: `string`

### contentHash?

> `optional` **contentHash?**: `string`

### contractName?

> `optional` **contractName?**: `string`

### covenantId?

> `optional` **covenantId?**: `string`

### draftArtifactId?

> `optional` **draftArtifactId?**: `string`

### entrypoint?

> `optional` **entrypoint?**: `string`

### hardkasVersion?

> `optional` **hardkasVersion?**: `string`

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

### networkId?

> `optional` **networkId?**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"` = `kaspaNetworkIdSchema`

### nextState?

> `optional` **nextState?**: `Record`\<`string`, `unknown`\>

### planArtifactId?

> `optional` **planArtifactId?**: `string`

### policy?

> `optional` **policy?**: `string`

### previousState?

> `optional` **previousState?**: `Record`\<`string`, `unknown`\>

### schema?

> `optional` **schema?**: `"hardkas.covenantTransitionFact.v1"`

### spentOutpoint?

> `optional` **spentOutpoint?**: `object`

#### spentOutpoint.index?

> `optional` **index?**: `number`

#### spentOutpoint.transactionId?

> `optional` **transactionId?**: `string`

### successorAmountSompi?

> `optional` **successorAmountSompi?**: `string`

### successorOutpoint?

> `optional` **successorOutpoint?**: `object`

#### successorOutpoint.index?

> `optional` **index?**: `number`

#### successorOutpoint.transactionId?

> `optional` **transactionId?**: `string`

### timestamp?

> `optional` **timestamp?**: `string`

### txId?

> `optional` **txId?**: `string`

### validation?

> `optional` **validation?**: `object`

#### validation.diagnostic?

> `optional` **diagnostic?**: `string`

#### validation.scriptVmPassed?

> `optional` **scriptVmPassed?**: `boolean`

#### validation.structuralPassed?

> `optional` **structuralPassed?**: `boolean`

#### validation.vmStatus?

> `optional` **vmStatus?**: `string`
