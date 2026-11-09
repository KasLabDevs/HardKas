[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / v1StorageMass

# Function: v1StorageMass()

> **v1StorageMass**(`inputs`, `outputs`): `bigint`

Defined in: [packages/tx-builder/src/v1-mass.ts:172](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L172)

mass/mod.rs `calc_storage_mass` (KIP-9 with the Toccata plurality), integer arithmetic as the node does it:
- outputs: harmonic Σ C·p·p / v (multiplications first, then one integer division; overflow → undefined, the node's
  None), and their plurality;
- relaxed formula when the outputs' plurality is 1, or with at most 2 inputs whose plurality is 1, or outputs and
  inputs both of plurality 2: harmonic(outputs) − harmonic(inputs), saturating;
- otherwise: mean = max(Σ input values / inputs' plurality, 1); arithmetic = inputs' plurality × (C / mean);
  harmonic(outputs) − arithmetic, saturating.
A coinbase transaction has storage mass 0 (not handled here: HardKAS never builds one).

## Parameters

### inputs

readonly [`V1StorageCell`](../interfaces/V1StorageCell.md)[]

### outputs

readonly [`V1StorageCell`](../interfaces/V1StorageCell.md)[]

## Returns

`bigint`
