[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / estimateFee

# ~~Function: estimateFee()~~

> **estimateFee**(`request`): [`FeeEstimationResult`](../interfaces/FeeEstimationResult.md)

Defined in: [packages/tx-builder/src/fee-estimator.ts:76](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/fee-estimator.ts#L76)

## Parameters

### request

[`FeeEstimationRequest`](../interfaces/FeeEstimationRequest.md)

## Returns

[`FeeEstimationResult`](../interfaces/FeeEstimationResult.md)

## Deprecated

Since M10-C. `estimateFee` implements a HardKAS "conservative"
`+10%` heuristic over the pinned SDK mass, on top of a hardcoded
`DEFAULT_MINIMUM_RELAY_RATE_SOMPI_PER_MASS = 100n`. Upstream
`Generator.estimate()` (via `estimateTransactionsUpstream` in
`kaspa-wallet-adapter.ts`) is exact — no +10% padding, and it reads the
network params from the SDK. Use that for anything you plan to submit.

This function will continue to work through M10 for backward compatibility
but SHOULD NOT be used in new code.
