[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / updateDeploymentStatus

# Function: updateDeploymentStatus()

> **updateDeploymentStatus**(`record`, `newStatus`, `txId?`): [`DeploymentRecord`](../interfaces/DeploymentRecord.md)

Defined in: [packages/artifacts/src/deployment.ts:54](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/deployment.ts#L54)

## Parameters

### record

[`DeploymentRecord`](../interfaces/DeploymentRecord.md)

### newStatus

`"unknown"` \| `"confirmed"` \| `"failed"` \| `"planned"` \| `"sent"`

### txId?

[`TxId`](../../../sdk/src/type-aliases/TxId.md)

## Returns

[`DeploymentRecord`](../interfaces/DeploymentRecord.md)
