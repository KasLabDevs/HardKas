[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / collectCovenantTransactions

# Function: collectCovenantTransactions()

> **collectCovenantTransactions**(`workspaceRoot`, `covenantId`): [`CovenantLineageTx`](../interfaces/CovenantLineageTx.md)[]

Defined in: [packages/sdk/src/covenant-lineage.ts:111](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L111)

Every transaction of `covenantId` this workspace recorded (only artifacts whose identity verifies count): the engine's
v1 signed transactions (with their plans and submissions) and the `hardkas silver covenant` records, merged by txid.

## Parameters

### workspaceRoot

`string`

### covenantId

`string`

## Returns

[`CovenantLineageTx`](../interfaces/CovenantLineageTx.md)[]
