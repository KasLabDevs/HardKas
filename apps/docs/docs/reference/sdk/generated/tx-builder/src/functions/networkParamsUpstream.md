[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / networkParamsUpstream

# Function: networkParamsUpstream()

> **networkParamsUpstream**(`networkId`): `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:88](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L88)

`getNetworkParams(networkId)` — dust threshold, min-relay, coinbase maturity
and other per-network parameters. Replaces every HardKAS hardcoded constant
(dust=600n, min-relay=100n, coinbase-maturity=1000n) once callers migrate.

## Parameters

### networkId

`string`

## Returns

`any`
