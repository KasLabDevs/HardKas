[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / calculateUpstreamMass

# Function: calculateUpstreamMass()

> **calculateUpstreamMass**(`input`): [`UpstreamMassResult`](../interfaces/UpstreamMassResult.md)

Defined in: [packages/tx-builder/src/mass.ts:351](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L351)

Like [measureUpstreamMass](measureUpstreamMass.md), but a transaction above the maximum
standard mass (the wallet's policy, 100,000 g; L1-08: not a node relay rule) is an error.

## Parameters

### input

[`UpstreamMassInput`](../interfaces/UpstreamMassInput.md)

## Returns

[`UpstreamMassResult`](../interfaces/UpstreamMassResult.md)
