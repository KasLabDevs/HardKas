[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / saveDeployment

# Function: saveDeployment()

> **saveDeployment**(`rootDir`, `record`): `Promise`\<`string`\>

Defined in: [packages/artifacts/src/deployment-store.ts:14](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/deployment-store.ts#L14)

Manages deployment records on the filesystem.
Storage: `.hardkas/deployments/{networkId}/{label}.json`

## Parameters

### rootDir

`string`

### record

[`DeploymentRecord`](../interfaces/DeploymentRecord.md)

## Returns

`Promise`\<`string`\>
