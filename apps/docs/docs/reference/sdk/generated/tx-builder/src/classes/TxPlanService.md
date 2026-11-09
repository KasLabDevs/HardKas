[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / TxPlanService

# Class: TxPlanService

Defined in: [packages/tx-builder/src/service.ts:140](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L140)

## Constructors

### Constructor

> **new TxPlanService**(`provider`, `options?`): `TxPlanService`

Defined in: [packages/tx-builder/src/service.ts:148](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L148)

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

Defined in: [packages/tx-builder/src/service.ts:146](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L146)

Coinbase maturity, in DAA blocks, for the simulator's UTXOs; simnet's when
unset. Real networks take it from `k.getNetworkParams(networkId)` via
`filterMatureUtxos`.

## Methods

### planConsolidation()

> **planConsolidation**(`request`): `Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

Defined in: [packages/tx-builder/src/service.ts:276](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L276)

Plans a consolidation: every UTXO in `selectedUtxos` goes to one output at
`toAddress`, priced by the `Generator`. UTXOs that do not fit in one standard
transaction are refused (MULTI_TRANSACTION_PLAN_REQUIRED): consolidate them in
smaller batches. A covenant's UTXO among them is refused
(COVENANT_UTXO_NOT_PAYMENT_INPUT): consolidating it would end the covenant.

#### Parameters

##### request

[`ConsolidationRequest`](../interfaces/ConsolidationRequest.md)

#### Returns

`Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

***

### planTransactionSynthetic()

> **planTransactionSynthetic**(`request`): `Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

Defined in: [packages/tx-builder/src/service.ts:187](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L187)

Plans a payment for the HardKAS simulator: the same `Generator`, over the
simulator's synthetic identities, labelled `SYNTHETIC_SIMULATOR`
(NON-AUTHORITATIVE).

Callers MUST route to this method only when the execution domain is a
HardKAS simulator; real networks MUST use `planTransactionUpstream`. There
is no automatic fallback from one to the other: a failure surfaces, it is
never silently downgraded.

#### Parameters

##### request

[`PlanTransactionRequest`](../interfaces/PlanTransactionRequest.md)

#### Returns

`Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

***

### planTransactionUpstream()

> **planTransactionUpstream**(`request`): `Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>

Defined in: [packages/tx-builder/src/service.ts:173](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/service.ts#L173)

Plans a payment on a real Kaspa network with the pinned kaspa-wasm
`Generator`, which selects the inputs, prices the transaction and makes the
change (`planPaymentWithGenerator`). HardKAS only prepares its candidates:

- immature coinbase UTXOs are dropped (maturity from the SDK's network
  parameters, plus the 10-DAA margin above);
- `excludeOutpoints` are dropped before the Generator, never after (it owns
  selection);
- a covenant's UTXOs (covenant id set) are dropped: a payment never spends
  one (COVENANT-UTXO-PAYMENT-FILTER-1, see `covenant-utxos.ts`).

A spend that does not fit in one standard transaction is refused
(MULTI_TRANSACTION_PLAN_REQUIRED), and so is a change output too small to be
standard (CHANGE_BELOW_STANDARD_OUTPUT). `version` is recorded as given;
covenant bindings are not planned here (see `@hardkas/accounts`
`buildCovenantGenesis`).

#### Parameters

##### request

[`PlanTransactionRequest`](../interfaces/PlanTransactionRequest.md)

#### Returns

`Promise`\<[`TxPlanResult`](../interfaces/TxPlanResult.md)\>
