[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / planWithGenerator

# Function: planWithGenerator()

> **planWithGenerator**(`request`): `Promise`\<[`GeneratorPlanOutcome`](../interfaces/GeneratorPlanOutcome.md)\>

Defined in: [packages/tx-builder/src/generator-plan.ts:99](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/generator-plan.ts#L99)

Plans ONE transaction with the Generator, or refuses with a HardKAS error. The
Generator takes the UTXOs in the order given, which is the order their source
listed them in: HardKAS adds no selection policy of its own.

## Parameters

### request

[`GeneratorPlanRequest`](../interfaces/GeneratorPlanRequest.md)

## Returns

`Promise`\<[`GeneratorPlanOutcome`](../interfaces/GeneratorPlanOutcome.md)\>
