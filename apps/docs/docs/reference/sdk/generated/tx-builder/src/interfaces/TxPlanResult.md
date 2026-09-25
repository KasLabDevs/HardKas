[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / TxPlanResult

# Interface: TxPlanResult

Defined in: [packages/tx-builder/src/service.ts:86](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L86)

## Properties

### plan

> **plan**: [`TxPlan`](TxPlan.md)

Defined in: [packages/tx-builder/src/service.ts:87](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L87)

***

### plannerAuthority?

> `optional` **plannerAuthority?**: [`PlannerAuthority`](../type-aliases/PlannerAuthority.md)

Defined in: [packages/tx-builder/src/service.ts:102](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L102)

Provenance of the planning algorithm. Set on `planTransactionUpstream`
(KASPA_WASM_GENERATOR) and `planTransactionSynthetic`
(SYNTHETIC_SIMULATOR). Left undefined on the deprecated `planTransaction`
to keep existing tests that assert its absence stable during the
transition.

***

### plannerAuthorityDetail?

> `optional` **plannerAuthorityDetail?**: `string`

Defined in: [packages/tx-builder/src/service.ts:107](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L107)

Optional free-form detail for the authority (e.g. `2.0.1` for the WASM
SDK version). Never a substitute for `plannerAuthority`.

***

### utxoSelection

> **utxoSelection**: `object`

Defined in: [packages/tx-builder/src/service.ts:88](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/service.ts#L88)

#### purpose?

> `optional` **purpose?**: `"wallet-consolidation"`

#### selectedUtxos

> **selectedUtxos**: `number`

#### selectionStrategy

> **selectionStrategy**: `"largest-first"` \| `"consolidation-smallest-first"` \| `"upstream-generator"`

#### totalUtxosSeen

> **totalUtxosSeen**: `number`

#### warnings?

> `optional` **warnings?**: `string`[]
