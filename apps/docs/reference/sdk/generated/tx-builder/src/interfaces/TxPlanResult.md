[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / TxPlanResult

# Interface: TxPlanResult

Defined in: [packages/tx-builder/src/service.ts:90](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L90)

## Properties

### plan

> **plan**: [`TxPlan`](TxPlan.md)

Defined in: [packages/tx-builder/src/service.ts:91](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L91)

***

### plannerAuthority?

> `optional` **plannerAuthority?**: [`PlannerAuthority`](../type-aliases/PlannerAuthority.md)

Defined in: [packages/tx-builder/src/service.ts:100](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L100)

Provenance of the plan; set on every plan.

***

### plannerAuthorityDetail?

> `optional` **plannerAuthorityDetail?**: `string`

Defined in: [packages/tx-builder/src/service.ts:105](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L105)

Optional free-form detail for the authority (e.g. `kaspa-wasm@<version>`).
Never a substitute for `plannerAuthority`.

***

### utxoSelection

> **utxoSelection**: `object`

Defined in: [packages/tx-builder/src/service.ts:92](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/service.ts#L92)

#### purpose?

> `optional` **purpose?**: `"wallet-consolidation"`

#### selectedUtxos

> **selectedUtxos**: `number`

#### selectionStrategy

> **selectionStrategy**: `"consolidation-smallest-first"` \| `"upstream-generator"`

#### totalUtxosSeen

> **totalUtxosSeen**: `number`

#### warnings?

> `optional` **warnings?**: `string`[]
