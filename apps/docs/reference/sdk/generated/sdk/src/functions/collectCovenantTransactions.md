[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / collectCovenantTransactions

# Function: collectCovenantTransactions()

> **collectCovenantTransactions**(`workspaceRoot`, `covenantId`): [`CovenantLineageTx`](../interfaces/CovenantLineageTx.md)[]

Defined in: [packages/sdk/src/covenant-lineage.ts:111](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenant-lineage.ts#L111)

Every transaction of `covenantId` this workspace recorded (only artifacts whose identity verifies count): the engine's
v1 signed transactions (with their plans and submissions) and the `hardkas silver covenant` records, merged by txid.

## Parameters

### workspaceRoot

`string`

### covenantId

`string`

## Returns

[`CovenantLineageTx`](../interfaces/CovenantLineageTx.md)[]
