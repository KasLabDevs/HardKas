[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / v1FeeMass

# Function: v1FeeMass()

> **v1FeeMass**(`masses`): `bigint`

Defined in: [packages/tx-builder/src/v1-mass.ts:216](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-mass.ts#L216)

mining/src/mempool/check_transaction_standard.rs: the mass the relay fee is charged on is the larger of the compute mass
and the transient mass normalized by the block-limit cofactor (compute limit / transient limit = 0.5, rounded up as the
node's `ceil`). The storage mass has no relay-fee floor of its own.

## Parameters

### masses

`Pick`\<[`V1NonContextualMasses`](../interfaces/V1NonContextualMasses.md), `"computeMass"` \| `"transientMass"`\>

## Returns

`bigint`
