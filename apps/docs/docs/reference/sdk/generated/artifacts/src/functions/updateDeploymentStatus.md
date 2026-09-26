[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / updateDeploymentStatus

# Function: updateDeploymentStatus()

> **updateDeploymentStatus**(`record`, `newStatus`, `txId?`): [`DeploymentRecord`](../interfaces/DeploymentRecord.md)

Defined in: [packages/artifacts/src/deployment.ts:53](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/deployment.ts#L53)

## Parameters

### record

[`DeploymentRecord`](../interfaces/DeploymentRecord.md)

### newStatus

`"unknown"` \| `"confirmed"` \| `"failed"` \| `"planned"` \| `"sent"`

### txId?

[`TxId`](../../../sdk/src/type-aliases/TxId.md)

## Returns

[`DeploymentRecord`](../interfaces/DeploymentRecord.md)
