[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / v1NonContextualMasses

# Function: v1NonContextualMasses()

> **v1NonContextualMasses**(`shape`): [`V1NonContextualMasses`](../interfaces/V1NonContextualMasses.md)

Defined in: [packages/tx-builder/src/v1-mass.ts:125](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L125)

mass/mod.rs `MassCalculator::calc_non_contextual_masses`: compute = size × mass_per_tx_byte + Σ outputs (2 + script)
× mass_per_script_pub_key_byte + (v1: Σ compute budget × 100 g; v0: Σ sig-op count × 1000 g); transient = size × 4.
A covenant binding adds to the size, not to the script public key term.

## Parameters

### shape

[`V1MassTxShape`](../interfaces/V1MassTxShape.md)

## Returns

[`V1NonContextualMasses`](../interfaces/V1NonContextualMasses.md)
