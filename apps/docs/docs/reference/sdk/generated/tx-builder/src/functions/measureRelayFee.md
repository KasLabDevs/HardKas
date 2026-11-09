[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / measureRelayFee

# Function: measureRelayFee()

> **measureRelayFee**(`input`): `object`

Defined in: [packages/tx-builder/src/mass.ts:281](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/mass.ts#L281)

The fee the node relays this transaction at: the network's minimum rate per gram
of COMPUTE mass, priced by the SDK on the same transaction with amounts so large
that storage mass vanishes. rusty-kaspad 2.1.0 rejects below it ("…required amount
of N for compute mass M") and relayed storage-bound transactions paying only this
when measured on 2026-09-29; the Generator never pays less. Storage mass still
bounds standardness ([measureUpstreamMass](measureUpstreamMass.md)'s `standard`).

## Parameters

### input

[`UpstreamMassInput`](../interfaces/UpstreamMassInput.md)

## Returns

`object`

### computeMass

> **computeMass**: `bigint`

### relayFeeSompi

> **relayFeeSompi**: `bigint`
