[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / measureBuiltTransactionMass

# Function: measureBuiltTransactionMass()

> **measureBuiltTransactionMass**(`tx`, `networkId?`): [`UpstreamMassResult`](../interfaces/UpstreamMassResult.md)

Defined in: [packages/tx-builder/src/mass.ts:198](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L198)

Mass and minimum fee of a transaction the caller has already built as a WASM
`Transaction` — for inputs whose signature script is not P2PK (P2SH
contracts), filled in at its final length so the SDK prices its real size.

The SDK always adds one expected-signature allowance per input, even to a
filled signature script, so the result is above the node's figure by that
allowance: the fee never falls short of the node's minimum.

## Parameters

### tx

`unknown`

### networkId?

`string`

## Returns

[`UpstreamMassResult`](../interfaces/UpstreamMassResult.md)
