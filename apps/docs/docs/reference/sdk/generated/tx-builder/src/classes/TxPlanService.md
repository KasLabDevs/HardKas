[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / TxPlanService

# Class: TxPlanService

Defined in: [packages/tx-builder/src/service.ts:110](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L110)

## Constructors

### Constructor

> **new TxPlanService**(`provider`, `options?`): `TxPlanService`

Defined in: [packages/tx-builder/src/service.ts:127](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L127)

#### Parameters

##### provider

[`UtxoProvider`](../interfaces/UtxoProvider.md)

##### options?

[`TxPlanServiceOptions`](../interfaces/TxPlanServiceOptions.md) = `{}`

#### Returns

`TxPlanService`

## Properties

### coinbaseMaturity

> `readonly` **coinbaseMaturity**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:125](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L125)

Coinbase maturity, in DAA blocks.

- **Legacy path** (`planTransaction`, `planConsolidation`): required. Passed
  through to `buildPaymentPlan`, which enforces the maturity filter.
- **Upstream path** (`planTransactionUpstream`): ignored. Maturity comes
  from `k.getNetworkParams(networkId)` via `filterMatureUtxos`.

Constructing the service without a maturity value is legal; only the
legacy methods throw `COINBASE_MATURITY_UNRESOLVED` when invoked.

***

### marginFeePerInput

> `readonly` **marginFeePerInput**: `bigint`

Defined in: [packages/tx-builder/src/service.ts:113](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L113)

***

### maxInputsPerTx

> `readonly` **maxInputsPerTx**: `number`

Defined in: [packages/tx-builder/src/service.ts:111](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L111)

***

### warnInputs

> `readonly` **warnInputs**: `number`

Defined in: [packages/tx-builder/src/service.ts:112](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L112)

## Methods

### planConsolidation()

> **planConsolidation**(`request`): `Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

Defined in: [packages/tx-builder/src/service.ts:511](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L511)

#### Parameters

##### request

[`ConsolidationRequest`](../interfaces/ConsolidationRequest.md)

#### Returns

`Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

***

### ~~planTransaction()~~

> **planTransaction**(`request`): `Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

Defined in: [packages/tx-builder/src/service.ts:154](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L154)

#### Parameters

##### request

[`PlanTransactionRequest`](../interfaces/PlanTransactionRequest.md)

#### Returns

`Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

#### Deprecated

Legacy HardKAS planner (largest-first + fee convergence over
`buildPaymentPlan`). Kept solely as the machinery under
`planTransactionSynthetic` (simulator-only) and as a comparison baseline
for differential tests. NO real-network execution path should reach this
method directly — real networks go through `planTransactionUpstream`.
Callers wanting the simulator planner should use
`planTransactionSynthetic`, which labels its output NON-AUTHORITATIVE via
`plannerAuthority = SYNTHETIC_SIMULATOR`.

***

### planTransactionSynthetic()

> **planTransactionSynthetic**(`request`): `Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

Defined in: [packages/tx-builder/src/service.ts:502](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L502)

Synthetic (simulator-only) planner. Runs the same legacy machinery as
`planTransaction` but is explicitly labelled `SYNTHETIC_SIMULATOR` and
documented as NON-AUTHORITATIVE. This exists so the `mode: simulated`
developer harness (kaspa:sim_* accounts, `mock-script` SPKs) keeps
working without ever being reachable from a real Kaspa execution path.

Callers MUST route to this method only when the execution domain is a
HardKAS simulator; real networks (mainnet/testnet-N/devnet/simnet with a
real node/localnet) MUST use `planTransactionUpstream`. There is no
automatic fallback from the upstream path to this one — an upstream
failure must surface, not be silently downgraded.

#### Parameters

##### request

[`PlanTransactionRequest`](../interfaces/PlanTransactionRequest.md)

#### Returns

`Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

***

### planTransactionUpstream()

> **planTransactionUpstream**(`request`): `Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

Defined in: [packages/tx-builder/src/service.ts:335](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L335)

Upstream-authoritative planner (M10-B-completion). Uses kaspa-wasm 2.0.1
`Generator` for coin selection, mass and fee. Adapts the resulting
`PendingTransaction` into HardKAS `TxPlan` shape without inventing
semantics.

Rules honored:
- `excludeOutpoints` is pre-filtered on entries; **not** re-applied after
  selection (upstream owns selection).
- `request.feeEstimator` custom callback is **ignored on this path**;
  upstream is the fee authority. When callers set it, the effect is a
  no-op here (documented; will be removed once every consumer migrates).
- Coinbase maturity comes from `k.getNetworkParams(networkId)` via
  `filterMatureUtxos`, plus the same `+10n` DAG safety margin the legacy
  path used, to avoid mempool-vs-virtual-DAA races. This margin is a
  HardKAS lifecycle tolerance, not an override of the protocol threshold.
- `feePolicy`, `version`, `genesisCovenantGroups`, `computeBudget` are
  currently NOT wired to the upstream planner (Generator has no per-output
  covenant binding). Callers that need those still use covenant-specific
  builders directly (see `@hardkas/accounts` `buildCovenantGenesis`).

#### Parameters

##### request

[`PlanTransactionRequest`](../interfaces/PlanTransactionRequest.md)

#### Returns

`Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>
