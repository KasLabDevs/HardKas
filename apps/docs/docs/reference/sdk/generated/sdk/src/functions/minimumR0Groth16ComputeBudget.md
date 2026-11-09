[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / minimumR0Groth16ComputeBudget

# Function: minimumR0Groth16ComputeBudget()

> **minimumR0Groth16ComputeBudget**(`vkElements?`, `overheadScriptUnits?`): `number`

Defined in: [packages/sdk/src/zk/toccata.ts:82](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L82)

Smallest compute budget whose allowance (budget * 10,000 + 9,999 script units) covers the observed script
overhead, the Groth16 tag cost and the per-element VK cost: 1550 for the RISC Zero wrapper (6 elements).

## Parameters

### vkElements?

`number` = `R0_GROTH16_VK_ELEMENTS`

### overheadScriptUnits?

`bigint` = `R0_GROTH16_OBSERVED_SCRIPT_OVERHEAD_SCRIPT_UNITS`

## Returns

`number`
