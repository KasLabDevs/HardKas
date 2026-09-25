[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / DEFAULT\_MINIMUM\_RELAY\_RATE\_SOMPI\_PER\_MASS

# ~~Variable: DEFAULT\_MINIMUM\_RELAY\_RATE\_SOMPI\_PER\_MASS~~

> `const` **DEFAULT\_MINIMUM\_RELAY\_RATE\_SOMPI\_PER\_MASS**: `100n` = `100n`

Defined in: [packages/tx-builder/src/fee-estimator.ts:13](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/fee-estimator.ts#L13)

## Deprecated

Since M10-C. A hardcoded default is a HardKAS invention that
happens to match today's simnet floor; on any real network the fee-rate must
come from `networkParamsUpstream(networkId)` or `rpcFeeEstimate(rpc)` (see
`kaspa-wallet-adapter.ts`). Kept for backward compatibility with the
deprecated `estimateFee` path.
