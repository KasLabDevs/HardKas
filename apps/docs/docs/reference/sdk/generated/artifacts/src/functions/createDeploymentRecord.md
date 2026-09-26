[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createDeploymentRecord

# Function: createDeploymentRecord()

> **createDeploymentRecord**(`opts`): [`DeploymentRecord`](../interfaces/DeploymentRecord.md)

Defined in: [packages/artifacts/src/deployment.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/deployment.ts#L12)

## Parameters

### opts

#### deployedAddresses?

`string`[]

#### deployer?

`string`

#### label

`string`

#### networkId

[`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

#### notes?

`string`

#### payloadHash?

`string`

#### planArtifactId?

[`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

#### receiptArtifactId?

[`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

#### status?

`"unknown"` \| `"confirmed"` \| `"failed"` \| `"planned"` \| `"sent"`

#### txId?

[`TxId`](../../../sdk/src/type-aliases/TxId.md)

## Returns

[`DeploymentRecord`](../interfaces/DeploymentRecord.md)
