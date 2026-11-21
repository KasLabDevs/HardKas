[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / updateDeploymentStatus

# Function: updateDeploymentStatus()

> **updateDeploymentStatus**(`record`, `newStatus`, `txId?`): [`DeploymentRecord`](../interfaces/DeploymentRecord.md)

Defined in: [packages/artifacts/src/deployment.ts:54](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/deployment.ts#L54)

## Parameters

### record

[`DeploymentRecord`](../interfaces/DeploymentRecord.md)

### newStatus

`"unknown"` \| `"confirmed"` \| `"failed"` \| `"planned"` \| `"sent"`

### txId?

[`TxId`](../../../sdk/src/type-aliases/TxId.md)

## Returns

[`DeploymentRecord`](../interfaces/DeploymentRecord.md)
