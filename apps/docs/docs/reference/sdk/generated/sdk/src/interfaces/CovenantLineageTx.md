[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantLineageTx

# Interface: CovenantLineageTx

Defined in: [packages/sdk/src/covenant-lineage.ts:38](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L38)

One transaction of a covenant, as this workspace recorded it.

## Properties

### anchor?

> `readonly` `optional` **anchor?**: `object`

Defined in: [packages/sdk/src/covenant-lineage.ts:47](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L47)

A genesis: the authorizing input's outpoint (absent when the record does not hold the genesis transaction).

#### index

> `readonly` **index**: `number`

#### transactionId

> `readonly` **transactionId**: `string`

***

### covenantIdFromNode?

> `readonly` `optional` **covenantIdFromNode?**: `string`

Defined in: [packages/sdk/src/covenant-lineage.ts:49](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L49)

A genesis recorded by `silver covenant genesis --wait`: the covenant id the node reported for its output.

***

### fact?

> `readonly` `optional` **fact?**: `object`

Defined in: [packages/sdk/src/covenant-lineage.ts:53](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L53)

Linked covenant transition fact, if available in workspace artifacts

#### artifactSha256

> **artifactSha256**: `string`

#### contentHash?

> `optional` **contentHash?**: `string`

#### contractName

> **contractName**: `string`

#### covenantId

> **covenantId**: `string`

#### draftArtifactId?

> `optional` **draftArtifactId?**: `string`

#### entrypoint

> **entrypoint**: `string`

#### hardkasVersion

> **hardkasVersion**: `string`

#### hashVersion

> **hashVersion**: `string` \| `number`

#### networkId

> **networkId**: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`

#### nextState?

> `optional` **nextState?**: `Record`\<`string`, `unknown`\>

#### planArtifactId

> **planArtifactId**: `string`

#### policy?

> `optional` **policy?**: `string`

#### previousState?

> `optional` **previousState?**: `Record`\<`string`, `unknown`\>

#### schema

> **schema**: `"hardkas.covenantTransitionFact.v1"`

#### spentOutpoint

> **spentOutpoint**: `object`

##### spentOutpoint.index

> **index**: `number`

##### spentOutpoint.transactionId

> **transactionId**: `string`

#### successorAmountSompi?

> `optional` **successorAmountSompi?**: `string`

#### successorOutpoint?

> `optional` **successorOutpoint?**: `object`

##### successorOutpoint.index

> **index**: `number`

##### successorOutpoint.transactionId

> **transactionId**: `string`

#### timestamp

> **timestamp**: `string`

#### txId

> **txId**: `string`

#### validation

> **validation**: `object`

##### validation.diagnostic?

> `optional` **diagnostic?**: `string`

##### validation.scriptVmPassed?

> `optional` **scriptVmPassed?**: `boolean`

##### validation.structuralPassed

> **structuralPassed**: `boolean`

##### validation.vmStatus?

> `optional` **vmStatus?**: `string`

***

### kind

> `readonly` **kind**: `"genesis"` \| `"transition"`

Defined in: [packages/sdk/src/covenant-lineage.ts:40](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L40)

***

### outputs

> `readonly` **outputs**: readonly [`CovenantLineageOutput`](CovenantLineageOutput.md)[]

Defined in: [packages/sdk/src/covenant-lineage.ts:45](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L45)

***

### recorded

> `readonly` **recorded**: `"unknown"` \| `"submitted"` \| `"accepted"` \| `"confirmed"` \| `"rejected"` \| `"not-submitted"`

Defined in: [packages/sdk/src/covenant-lineage.ts:51](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L51)

What this workspace knows of its fate: its submission's recorded outcome, else the record's status.

***

### sources

> `readonly` **sources**: readonly `object`[]

Defined in: [packages/sdk/src/covenant-lineage.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L42)

The records it comes from: the engine's signed artifact, a `hardkas silver covenant` record, a covenant transition fact, or any combination.

***

### spends

> `readonly` **spends**: readonly `string`[]

Defined in: [packages/sdk/src/covenant-lineage.ts:44](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L44)

The covenant outpoints of this covenant it spends ("txid:index").

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/sdk/src/covenant-lineage.ts:39](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L39)
