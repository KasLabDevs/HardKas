[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / buildPaymentPlan

# ~~Function: buildPaymentPlan()~~

> **buildPaymentPlan**(`request`): [`TxPlan`](../interfaces/TxPlan.md)

Defined in: [packages/tx-builder/src/index.ts:100](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L100)

## Parameters

### request

[`TxBuildRequest`](../interfaces/TxBuildRequest.md)

## Returns

[`TxPlan`](../interfaces/TxPlan.md)

## Deprecated

COMPATIBILITY SHIM, not a planner. Plans come from the kaspa-wasm
Generator (`planPaymentWithGenerator`, `TxPlanService`). This synchronous selection
survives only behind the simulator's synchronous harness (`applySimulatedPayment`,
`harness.send()`) until that API migrates; no new consumers (a test enforces it).
