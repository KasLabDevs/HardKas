[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / deriveIntentWorkflowId

# Function: deriveIntentWorkflowId()

> **deriveIntentWorkflowId**(`intent`): `string`

Defined in: [packages/artifacts/src/tx-plan.ts:39](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/tx-plan.ts#L39)

Deterministic default `workflowId` for a root plan: the single derivation
(IC-7.4) over the plan's transfer INTENT (who pays whom, how much, on which
network, from which outpoints). Never derived from the artifact's own hash
(IC-1′.5); the digest is the domain digest (IC-1′.7).

## Parameters

### intent

#### amountSompi

`string`

#### fromAddress

`string`

#### mode

`string`

#### networkId

`string`

#### outpoints

`object`[]

#### toAddress

`string`

## Returns

`string`
