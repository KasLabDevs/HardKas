[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / calculateUpstreamMass

# Function: calculateUpstreamMass()

> **calculateUpstreamMass**(`input`): [`UpstreamMassResult`](../interfaces/UpstreamMassResult.md)

Defined in: [packages/tx-builder/src/mass.ts:237](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L237)

Like [measureUpstreamMass](measureUpstreamMass.md), but a transaction above the maximum
standard mass (which the node will not relay) is an error.

## Parameters

### input

[`UpstreamMassInput`](../interfaces/UpstreamMassInput.md)

## Returns

[`UpstreamMassResult`](../interfaces/UpstreamMassResult.md)
